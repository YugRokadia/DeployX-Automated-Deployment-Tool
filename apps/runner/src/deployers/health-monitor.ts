import {
  HEALTH_MONITOR_INTERVAL_MS,
  HEALTH_MONITOR_PROBE_TIMEOUT_MS,
  HEALTH_CHECK_WINDOW_SIZE,
  HEALTH_THRESHOLD_HEALTHY,
  HEALTH_THRESHOLD_DEGRADED,
} from "@deployx/shared";
import type { RunnerApiClient } from "../api-client";
import {
  listContainersByLabel,
  inspectContainer,
  isContainerRunning,
} from "./container-manager";
import { checkHealthViaDocker } from "./health-checker";
import {
  createWindow,
  pushEntry,
  computeHealth,
  type SlidingWindowState,
} from "./sliding-window";
import {
  createRemediationState,
  remediate,
  type RemediationState,
  type DeploymentRef,
} from "./remediation-engine";

// ── Types ───────────────────────────────────────────────────────

export interface HealthMonitorOptions {
  readonly client: RunnerApiClient;
  readonly intervalMs?: number;
  readonly signal?: AbortSignal;
}

interface MonitoredDeployment {
  readonly ref: DeploymentRef;
  readonly window: SlidingWindowState;
  readonly remediationState: RemediationState;
}

interface DiscoveredContainer {
  readonly containerName: string;
  readonly projectSlug: string;
  readonly deploymentId: string;
  readonly runId: string;
  readonly color: "blue" | "green" | null;
  readonly strategy: string;
  readonly imageTag: string;
  readonly healthPath: string;
  readonly appPort: number;
}

// ── Health Monitor ──────────────────────────────────────────────

export class HealthMonitor {
  private readonly client: RunnerApiClient;
  private readonly intervalMs: number;
  private readonly signal: AbortSignal;
  private timer: ReturnType<typeof setInterval> | null = null;
  private deployments: ReadonlyMap<string, MonitoredDeployment> = new Map();
  private isChecking = false;

  constructor(options: HealthMonitorOptions) {
    this.client = options.client;
    this.intervalMs = options.intervalMs ?? HEALTH_MONITOR_INTERVAL_MS;
    this.signal = options.signal ?? new AbortController().signal;
  }

  // ── Lifecycle ───────────────────────────────────────────────

  start(): void {
    if (this.timer) return;

    console.log(`[health-monitor] Starting (interval: ${this.intervalMs}ms)`);

    this.timer = setInterval(() => {
      if (this.signal.aborted) {
        this.stop();
        return;
      }
      void this.tick();
    }, this.intervalMs);

    this.signal.addEventListener("abort", () => this.stop(), { once: true });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[health-monitor] Stopped");
  }

  // ── Core Loop ─────────────────────────────────────────────

  private async tick(): Promise<void> {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const discovered = await this.discoverDeployments();
      const reconciled = this.reconcile(discovered);
      const updated = await this.checkAll(reconciled);
      this.deployments = updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[health-monitor] Tick failed: ${msg}`);
    } finally {
      this.isChecking = false;
    }
  }

  // ── Discovery ─────────────────────────────────────────────

  private async discoverDeployments(): Promise<readonly DiscoveredContainer[]> {
    const containers = await listContainersByLabel("deployx.role=app");
    const discovered: DiscoveredContainer[] = [];

    for (const c of containers) {
      if (!c.status.toLowerCase().startsWith("up")) continue;

      const inspection = await inspectContainer(c.name);
      if (!inspection) continue;

      const projectSlug = inspection.labels["deployx.project"];
      const deploymentId = inspection.labels["deployx.deployment"];
      const runId = inspection.labels["deployx.runId"];
      const color = (inspection.labels["deployx.color"] as "blue" | "green") ?? null;
      const strategy = inspection.labels["deployx.strategy"] ?? "blue_green";
      const healthPath = inspection.labels["deployx.healthPath"] ?? "/health";
      const appPort = parseInt(
        inspection.labels["deployx.appPort"] ?? "3000",
        10,
      );

      if (!projectSlug || !deploymentId || !runId) {
        console.warn(
          `[health-monitor] Skipping container ${c.name}: missing required labels`,
        );
        continue;
      }

      // Blue-green strategy requires a color label
      if (!color && strategy === "blue_green") {
        console.warn(
          `[health-monitor] Skipping container ${c.name}: blue_green requires color label`,
        );
        continue;
      }

      discovered.push({
        containerName: c.name,
        projectSlug,
        deploymentId,
        runId,
        color,
        strategy,
        imageTag: inspection.image,
        healthPath,
        appPort,
      });
    }

    return discovered;
  }

  // ── Reconciliation ────────────────────────────────────────

  private reconcile(
    discovered: readonly DiscoveredContainer[],
  ): ReadonlyMap<string, MonitoredDeployment> {
    const newMap = new Map<string, MonitoredDeployment>();

    for (const d of discovered) {
      const existing = this.deployments.get(d.deploymentId);

      // For non-blue-green strategies, use a synthetic color for DeploymentRef compatibility
      const effectiveColor = d.color ?? "blue";

      if (existing) {
        // Preserve sliding window and remediation state
        newMap.set(d.deploymentId, {
          ...existing,
          ref: {
            ...existing.ref,
            containerName: d.containerName,
            currentColor: effectiveColor,
            currentImageTag: d.imageTag,
          },
        });
      } else {
        // New deployment — initialize fresh state
        // For canary/rolling, previousImageTag is null so remediation skips rollback
        newMap.set(d.deploymentId, {
          ref: {
            deploymentId: d.deploymentId,
            runId: d.runId,
            projectSlug: d.projectSlug,
            containerName: d.containerName,
            healthPath: d.healthPath,
            appPort: d.appPort,
            currentImageTag: d.imageTag,
            previousImageTag: null,
            currentColor: effectiveColor,
          },
          window: createWindow(HEALTH_CHECK_WINDOW_SIZE),
          remediationState: createRemediationState(),
        });
      }
    }

    return newMap;
  }

  // ── Health Checking ───────────────────────────────────────

  private async checkAll(
    deployments: ReadonlyMap<string, MonitoredDeployment>,
  ): Promise<ReadonlyMap<string, MonitoredDeployment>> {
    const updated = new Map<string, MonitoredDeployment>();

    for (const [id, monitored] of deployments) {
      if (this.signal.aborted) break;
      const result = await this.checkOne(monitored);
      updated.set(id, result);
    }

    return updated;
  }

  private async checkOne(
    monitored: MonitoredDeployment,
  ): Promise<MonitoredDeployment> {
    const { ref } = monitored;

    // Dual check #1: Is container running?
    const containerRunning = await isContainerRunning(ref.containerName);

    // Dual check #2: HTTP health probe (only if container is running)
    let httpPassed = false;
    let probeResult = null;

    if (containerRunning) {
      probeResult = await checkHealthViaDocker(ref.containerName, ref.appPort, ref.healthPath, HEALTH_MONITOR_PROBE_TIMEOUT_MS);
      httpPassed = probeResult.passed;

      // Report health check to API (fire-and-forget)
      this.reportHealthCheck(ref, probeResult).catch(() => {});
    }

    // Combined result: both must pass
    const passed = containerRunning && httpPassed;

    // Update sliding window (immutable)
    const newWindow = pushEntry(monitored.window, {
      passed,
      timestamp: Date.now(),
    });

    // Compute aggregate health
    const aggregateHealth = computeHealth(
      newWindow,
      HEALTH_THRESHOLD_HEALTHY,
      HEALTH_THRESHOLD_DEGRADED,
    );

    // Log state changes
    const previousHealth = computeHealth(
      monitored.window,
      HEALTH_THRESHOLD_HEALTHY,
      HEALTH_THRESHOLD_DEGRADED,
    );

    if (aggregateHealth !== previousHealth) {
      console.log(
        `[health-monitor] ${ref.projectSlug}: ${previousHealth} → ${aggregateHealth}`,
      );
    }

    // Trigger remediation if needed
    const remediationResult = await remediate(
      ref,
      aggregateHealth,
      monitored.remediationState,
      this.client,
    );

    if (remediationResult.action !== "none") {
      console.log(
        `[health-monitor] ${ref.projectSlug}: ${remediationResult.action} ` +
          `(success=${remediationResult.success})`,
      );
    }

    return {
      ...monitored,
      window: newWindow,
      remediationState: remediationResult.newState,
    };
  }

  // ── API Reporting ─────────────────────────────────────────

  private async reportHealthCheck(
    ref: DeploymentRef,
    probeResult: {
      passed: boolean;
      statusCode: number | null;
      responseTimeMs: number;
      error?: string;
    },
  ): Promise<void> {
    try {
      await this.client.recordHealthCheck(ref.runId, ref.deploymentId, {
        status: probeResult.passed ? "pass" : "fail",
        response_time_ms: probeResult.responseTimeMs,
        status_code: probeResult.statusCode ?? undefined,
        error_message: probeResult.error,
      });
    } catch {
      // Fire-and-forget
    }
  }
}
