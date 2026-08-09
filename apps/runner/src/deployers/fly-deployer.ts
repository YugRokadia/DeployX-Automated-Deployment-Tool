import type { DeployerDriver, DeployContext, DeployResult } from "./deployer-interface";
import type { DeploymentStatus, HealthStatus } from "@deployx/shared";
import { FlyApiClient } from "./clients";
import type { FlyMachineConfig } from "./clients";
import { waitForHealthy, checkHealth } from "./health-checker";

// ── Constants ───────────────────────────────────────────────────

const MACHINE_WAIT_TIMEOUT_MS = 120_000;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;
const HEALTH_CHECK_RETRIES = 5;
const HEALTH_CHECK_INTERVAL_MS = 3_000;
const HEALTH_CHECK_START_PERIOD_MS = 5_000;

// ── VM Size Mapping ─────────────────────────────────────────────

const VM_SIZE_MAP: Record<string, { cpus: number; memory_mb: number }> = {
  "shared-cpu-1x": { cpus: 1, memory_mb: 256 },
  "shared-cpu-2x": { cpus: 2, memory_mb: 512 },
  "shared-cpu-4x": { cpus: 4, memory_mb: 1024 },
  "performance-1x": { cpus: 1, memory_mb: 2048 },
  "performance-2x": { cpus: 2, memory_mb: 4096 },
};

// ── Fly.io Deployer ─────────────────────────────────────────────

export class FlyDeployer implements DeployerDriver {
  readonly name = "fly_io";

  // Cached state from last deploy
  private cachedClient: FlyApiClient | null = null;
  private cachedAppName: string | null = null;
  private cachedMachineId: string | null = null;

  // ── Deploy ──────────────────────────────────────────────────

  async deploy(ctx: DeployContext): Promise<DeployResult> {
    const { logStreamer, taskRunId } = ctx;

    try {
      const flyClient = this.getApiClient(ctx);
      const appName = this.getAppName(ctx);
      this.cachedClient = flyClient;
      this.cachedAppName = appName;

      logStreamer.push({
        level: "info",
        message: `[fly.io] Starting deployment: ${ctx.imageTag} → ${appName}`,
        task_run_id: taskRunId,
      });

      // Validate image looks registry-qualified
      this.validateImageTag(ctx.imageTag);

      // Build machine config
      const machineConfig = this.buildMachineConfig(ctx);

      // Check for existing machines
      const existingMachines = await flyClient.listMachines(appName);
      const activeMachine = existingMachines.find(
        (m) => m.state === "started" || m.state === "stopped",
      );

      let machine;

      if (activeMachine) {
        logStreamer.push({
          level: "info",
          message: `[fly.io] Updating existing machine: ${activeMachine.id}`,
          task_run_id: taskRunId,
        });
        machine = await flyClient.updateMachine(
          appName,
          activeMachine.id,
          machineConfig,
        );
      } else {
        logStreamer.push({
          level: "info",
          message: `[fly.io] Creating new machine`,
          task_run_id: taskRunId,
        });
        machine = await flyClient.createMachine(appName, machineConfig);
      }

      this.cachedMachineId = machine.id;

      logStreamer.push({
        level: "info",
        message: `[fly.io] Machine ${machine.id}: waiting for started state`,
        task_run_id: taskRunId,
      });

      // Wait for machine to be started
      await flyClient.waitForMachineState(
        appName,
        machine.id,
        "started",
        MACHINE_WAIT_TIMEOUT_MS,
      );

      const publicUrl = `https://${appName}.fly.dev`;

      logStreamer.push({
        level: "info",
        message: `[fly.io] Machine started at ${publicUrl}`,
        task_run_id: taskRunId,
      });

      // Health check
      const healthPath = ctx.config.health_check?.path ?? "/health";
      const healthUrl = `${publicUrl}${healthPath}`;

      const healthResult = await waitForHealthy({
        url: healthUrl,
        timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
        retries: HEALTH_CHECK_RETRIES,
        intervalMs: HEALTH_CHECK_INTERVAL_MS,
        startPeriodMs: HEALTH_CHECK_START_PERIOD_MS,
      });

      this.reportHealthCheck(ctx, healthResult).catch(() => {});

      if (!healthResult.passed) {
        return {
          success: false,
          publicUrl,
          error: `Health check failed: ${healthResult.error}`,
        };
      }

      return { success: true, publicUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStreamer.push({
        level: "error",
        message: `[fly.io] ${msg}`,
        task_run_id: taskRunId,
      });
      return { success: false, error: msg };
    }
  }

  // ── Rollback ────────────────────────────────────────────────

  async rollback(
    ctx: DeployContext,
    targetRevisionImageTag: string,
  ): Promise<DeployResult> {
    ctx.logStreamer.push({
      level: "info",
      message: `[fly.io] Rolling back to ${targetRevisionImageTag}`,
      task_run_id: ctx.taskRunId,
    });

    return this.deploy({
      ...ctx,
      imageTag: targetRevisionImageTag,
    });
  }

  // ── Stop ────────────────────────────────────────────────────

  async stop(ctx: DeployContext): Promise<void> {
    const flyClient = this.cachedClient ?? this.getApiClient(ctx);
    const appName = this.cachedAppName ?? this.getAppName(ctx);

    try {
      const machines = await flyClient.listMachines(appName);

      for (const machine of machines) {
        if (machine.state === "started") {
          await flyClient.stopMachine(appName, machine.id);
        }
        await flyClient.destroyMachine(appName, machine.id);
      }

      ctx.logStreamer.push({
        level: "info",
        message: `[fly.io] Stopped and destroyed ${machines.length} machine(s)`,
        task_run_id: ctx.taskRunId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.logStreamer.push({
        level: "warn",
        message: `[fly.io] Failed to stop machines: ${msg}`,
        task_run_id: ctx.taskRunId,
      });
    }
  }

  // ── Status ──────────────────────────────────────────────────

  async getStatus(_projectSlug: string): Promise<DeploymentStatus> {
    if (!this.cachedClient || !this.cachedAppName || !this.cachedMachineId) {
      return "unknown" as DeploymentStatus;
    }

    try {
      const machine = await this.cachedClient.getMachine(
        this.cachedAppName,
        this.cachedMachineId,
      );
      return mapFlyState(machine.state);
    } catch {
      return "unknown" as DeploymentStatus;
    }
  }

  // ── Health ──────────────────────────────────────────────────

  async getHealth(
    _projectSlug: string,
    healthPath: string,
    _port: number,
  ): Promise<HealthStatus> {
    if (!this.cachedAppName) {
      return "unknown" as HealthStatus;
    }

    try {
      const result = await checkHealth(
        `https://${this.cachedAppName}.fly.dev${healthPath}`,
        HEALTH_CHECK_TIMEOUT_MS,
      );
      return result.passed
        ? ("healthy" as HealthStatus)
        : ("unhealthy" as HealthStatus);
    } catch {
      return "unknown" as HealthStatus;
    }
  }

  // ── Logs ────────────────────────────────────────────────────

  async getLogs(
    _containerName: string,
    tailLines = 100,
  ): Promise<readonly string[]> {
    if (!this.cachedClient || !this.cachedAppName || !this.cachedMachineId) {
      return [];
    }

    try {
      const logs = await this.cachedClient.getMachineLogs(
        this.cachedAppName,
        this.cachedMachineId,
        tailLines,
      );
      return logs.map((l) => `${l.timestamp} ${l.message}`);
    } catch {
      return [];
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  private getApiClient(ctx: DeployContext): FlyApiClient {
    const token = ctx.secrets.FLY_API_TOKEN;
    if (!token) {
      throw new Error(
        "FLY_API_TOKEN secret required. Add it in Project Settings → Secrets.",
      );
    }
    return new FlyApiClient({ apiToken: token });
  }

  private getAppName(ctx: DeployContext): string {
    return (
      ctx.secrets.FLY_APP_NAME ??
      ctx.config.fly?.app_name ??
      ctx.projectSlug
    );
  }

  private validateImageTag(imageTag: string): void {
    if (!imageTag.includes("/")) {
      throw new Error(
        `External deployers require a registry-qualified image (e.g., ghcr.io/user/app:tag), got: ${imageTag}`,
      );
    }
  }

  private buildMachineConfig(ctx: DeployContext): FlyMachineConfig {
    const port = ctx.config.port ?? 3000;
    const vmSize = ctx.config.fly?.vm_size ?? "shared-cpu-1x";
    const guest = VM_SIZE_MAP[vmSize] ?? VM_SIZE_MAP["shared-cpu-1x"];
    const region = ctx.config.fly?.region;

    return {
      image: ctx.imageTag,
      env: {
        PORT: String(port),
        ...ctx.config.env,
        ...(region ? { FLY_REGION: region } : {}),
      },
      services: [
        {
          ports: [
            { port: 80, handlers: ["http"] },
            { port: 443, handlers: ["tls", "http"] },
          ],
          protocol: "tcp",
          internal_port: port,
        },
      ],
      guest: {
        cpu_kind: vmSize.startsWith("performance") ? "performance" : "shared",
        cpus: guest.cpus,
        memory_mb: guest.memory_mb,
      },
    };
  }

  private async reportHealthCheck(
    ctx: DeployContext,
    result: {
      readonly passed: boolean;
      readonly statusCode: number | null;
      readonly responseTimeMs: number;
      readonly error?: string;
    },
  ): Promise<void> {
    try {
      await ctx.client.recordHealthCheck(ctx.job.run_id, ctx.deploymentId, {
        status: result.passed ? "pass" : "fail",
        response_time_ms: result.responseTimeMs,
        status_code: result.statusCode ?? undefined,
        error_message: result.error,
      });
    } catch {
      // Fire-and-forget
    }
  }
}

// ── State Mapping ───────────────────────────────────────────────

function mapFlyState(state: string): DeploymentStatus {
  switch (state) {
    case "started":
      return "active";
    case "starting":
    case "replacing":
      return "deploying";
    case "stopped":
      return "stopped";
    case "failed":
    case "destroyed":
      return "failed";
    default:
      return "pending";
  }
}
