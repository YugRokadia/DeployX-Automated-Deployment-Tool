import {
  MAX_RESTART_ATTEMPTS,
  RESTART_BACKOFF_BASE_MS,
  DEPLOYER_NETWORK_NAME,
} from "@deployx/shared";
import type { RunnerApiClient } from "../api-client";
import {
  restartContainer,
  isContainerRunning,
  runContainer,
  removeContainerIfExists,
  stopContainer,
} from "./container-manager";
import { allocatePort } from "./port-allocator";
import { generateNginxConfig, writeNginxConfig, reloadNginx } from "./nginx-config";
import { waitForHealthyViaDocker } from "./health-checker";
import type { AggregateHealth } from "./sliding-window";

// ── Types ───────────────────────────────────────────────────────

export interface DeploymentRef {
  readonly deploymentId: string;
  readonly runId: string;
  readonly projectSlug: string;
  readonly containerName: string;
  readonly healthPath: string;
  readonly appPort: number;
  readonly currentImageTag: string;
  readonly previousImageTag: string | null;
  readonly currentColor: "blue" | "green";
}

export interface RemediationState {
  readonly restartCount: number;
  readonly lastRestartAt: number;
  readonly isRemediating: boolean;
}

export interface RemediationResult {
  readonly action: "none" | "restart" | "rollback";
  readonly success: boolean;
  readonly newState: RemediationState;
  readonly error?: string;
}

// ── Factory ─────────────────────────────────────────────────────

export function createRemediationState(): RemediationState {
  return { restartCount: 0, lastRestartAt: 0, isRemediating: false };
}

// ── Backoff Calculator ──────────────────────────────────────────

export function calculateBackoffMs(attempt: number): number {
  return RESTART_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
}

export function isBackoffElapsed(state: RemediationState): boolean {
  if (state.restartCount === 0) return true;
  const backoff = calculateBackoffMs(state.restartCount);
  return Date.now() - state.lastRestartAt >= backoff;
}

// ── Remediation Decision ────────────────────────────────────────

export async function remediate(
  ref: DeploymentRef,
  health: AggregateHealth,
  state: RemediationState,
  client: RunnerApiClient,
): Promise<RemediationResult> {
  // Healthy + previous restarts → reset counter
  if (health === "healthy" && state.restartCount > 0) {
    return {
      action: "none",
      success: true,
      newState: createRemediationState(),
    };
  }

  // Healthy or degraded → no action
  if (health !== "unhealthy") {
    return { action: "none", success: true, newState: state };
  }

  // Already remediating (prevent concurrent remediation)
  if (state.isRemediating) {
    return { action: "none", success: true, newState: state };
  }

  // Check backoff
  if (!isBackoffElapsed(state)) {
    return { action: "none", success: true, newState: state };
  }

  // Can we still restart?
  if (state.restartCount < MAX_RESTART_ATTEMPTS) {
    return attemptRestart(ref, state, client);
  }

  // Restarts exhausted → rollback
  if (ref.previousImageTag) {
    return attemptRollback(ref, state, client);
  }

  // No previous image to rollback to
  await recordHealingEvent(client, ref, "rollback_failed", null, {
    error: "No previous revision available for rollback",
  });

  return {
    action: "rollback",
    success: false,
    newState: state,
    error: "Restarts exhausted and no previous revision available for rollback",
  };
}

// ── Restart Logic ───────────────────────────────────────────────

async function attemptRestart(
  ref: DeploymentRef,
  state: RemediationState,
  client: RunnerApiClient,
): Promise<RemediationResult> {
  const attemptNumber = state.restartCount + 1;

  await recordHealingEvent(client, ref, "restart_started", attemptNumber);

  try {
    await restartContainer(ref.containerName, 10);

    // Wait for the container to come back
    await sleep(3000);

    const running = await isContainerRunning(ref.containerName);

    if (running) {
      await recordHealingEvent(client, ref, "restart_succeeded", attemptNumber);
      return {
        action: "restart",
        success: true,
        newState: {
          restartCount: attemptNumber,
          lastRestartAt: Date.now(),
          isRemediating: false,
        },
      };
    }

    await recordHealingEvent(client, ref, "restart_failed", attemptNumber, {
      error: "Container did not start after restart",
    });

    return {
      action: "restart",
      success: false,
      newState: {
        restartCount: attemptNumber,
        lastRestartAt: Date.now(),
        isRemediating: false,
      },
      error: "Container did not start after restart",
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordHealingEvent(client, ref, "restart_failed", attemptNumber, {
      error,
    });

    return {
      action: "restart",
      success: false,
      newState: {
        restartCount: attemptNumber,
        lastRestartAt: Date.now(),
        isRemediating: false,
      },
      error,
    };
  }
}

// ── Rollback Logic ──────────────────────────────────────────────

async function attemptRollback(
  ref: DeploymentRef,
  state: RemediationState,
  client: RunnerApiClient,
): Promise<RemediationResult> {
  await recordHealingEvent(client, ref, "rollback_started", null, {
    from_image: ref.currentImageTag,
    to_image: ref.previousImageTag,
  });

  try {
    // Determine the opposite color for the rollback container
    const rollbackColor = ref.currentColor === "blue" ? "green" : "blue";
    const rollbackContainerName = `deployx-${ref.projectSlug}-${rollbackColor}`;

    // Clean up any existing container at the rollback slot
    await removeContainerIfExists(rollbackContainerName);

    // Start the rollback container with the previous image
    await runContainer({
      name: rollbackContainerName,
      image: ref.previousImageTag!,
      network: DEPLOYER_NETWORK_NAME,
      env: { PORT: String(ref.appPort) },
      labels: {
        "deployx.project": ref.projectSlug,
        "deployx.role": "app",
        "deployx.color": rollbackColor,
        "deployx.deployment": ref.deploymentId,
        "deployx.runId": ref.runId,
        "deployx.healthPath": ref.healthPath,
        "deployx.appPort": String(ref.appPort),
      },
      detach: true,
      restart: "unless-stopped",
    });

    // Wait for the rollback container to become healthy
    const healthResult = await waitForHealthyViaDocker({
      containerName: rollbackContainerName,
      port: ref.appPort,
      path: ref.healthPath,
      timeoutMs: 5000,
      retries: 3,
      intervalMs: 5000,
      startPeriodMs: 10000,
    });

    if (!healthResult.passed) {
      // Rollback container also unhealthy — clean up and fail
      await removeContainerIfExists(rollbackContainerName);
      await recordHealingEvent(client, ref, "rollback_failed", null, {
        error: `Rollback container unhealthy: ${healthResult.error}`,
      });

      return {
        action: "rollback",
        success: false,
        newState: { ...state, isRemediating: false },
        error: `Rollback container unhealthy: ${healthResult.error}`,
      };
    }

    // Switch nginx to the rollback container
    const proxyContainerName = `deployx-proxy-${ref.projectSlug}`;
    const portAllocation = allocatePort(ref.projectSlug);

    const nginxConfig = generateNginxConfig({
      listenPort: 80,
      upstream: { name: rollbackContainerName, port: ref.appPort },
      healthCheckPath: ref.healthPath,
    });

    await writeNginxConfig(proxyContainerName, nginxConfig);
    await reloadNginx(proxyContainerName);

    // Stop the broken container
    await stopContainer(ref.containerName, 10);
    await removeContainerIfExists(ref.containerName);

    // Report rollback to the API
    try {
      await client.updateDeployment(ref.runId, ref.deploymentId, {
        status: "rolled_back",
        health_status: "unknown",
      });
    } catch {
      // Fire-and-forget
    }

    await recordHealingEvent(client, ref, "rollback_succeeded", null, {
      target_image: ref.previousImageTag,
      host_port: portAllocation.proxyPort,
    });

    return {
      action: "rollback",
      success: true,
      newState: { ...state, isRemediating: false },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordHealingEvent(client, ref, "rollback_failed", null, { error });

    return {
      action: "rollback",
      success: false,
      newState: { ...state, isRemediating: false },
      error,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────

async function recordHealingEvent(
  client: RunnerApiClient,
  ref: DeploymentRef,
  eventType: string,
  attemptNumber: number | null,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await client.recordHealingEvent(ref.runId, ref.deploymentId, {
      event_type: eventType,
      attempt_number: attemptNumber ?? undefined,
      container_name: ref.containerName,
      details,
    });
  } catch {
    // Fire-and-forget — don't crash remediation over API error
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
