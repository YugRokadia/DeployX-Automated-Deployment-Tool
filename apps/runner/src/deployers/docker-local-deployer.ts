import {
  DEPLOYER_NETWORK_NAME,
  BLUE_GREEN_DRAIN_SECONDS,
} from "@deployx/shared";
import type { DeploymentStatus, HealthStatus } from "@deployx/shared";
import type { DeployerDriver, DeployContext, DeployResult } from "./deployer-interface";
import {
  ensureNetwork,
  runContainer,
  stopContainer,
  removeContainerIfExists,
  isContainerRunning,
  getContainerLogs,
} from "./container-manager";
import { allocatePort } from "./port-allocator";
import { generateNginxConfig, writeNginxConfig, reloadNginx } from "./nginx-config";
import { waitForHealthyViaDocker } from "./health-checker";

// ── Types ───────────────────────────────────────────────────────

type Color = "blue" | "green";

// ── DockerLocalDeployer ─────────────────────────────────────────

export class DockerLocalDeployer implements DeployerDriver {
  readonly name = "docker_local";

  async deploy(ctx: DeployContext): Promise<DeployResult> {
    const { logStreamer, config, projectSlug } = ctx;
    const appPort = config.port;
    const healthPath = config.health_check?.path ?? "/health";
    const healthRetries = config.health_check?.retries ?? 3;
    const healthTimeoutS = config.health_check?.timeout_seconds ?? 5;
    const healthIntervalS = config.health_check?.interval_seconds ?? 10;
    const startPeriodS = config.health_check?.start_period_seconds ?? 15;

    try {
      // 1. Ensure Docker network
      logStreamer.push({
        level: "info",
        message: `[deploy] Ensuring Docker network: ${DEPLOYER_NETWORK_NAME}`,
        task_run_id: ctx.taskRunId,
      });
      await ensureNetwork(DEPLOYER_NETWORK_NAME);

      // 2. Determine current and new colors
      const currentColor = await this.getCurrentColor(projectSlug);
      const newColor = this.getOppositeColor(currentColor);
      const newContainerName = this.getAppContainerName(projectSlug, newColor);
      const oldContainerName = currentColor
        ? this.getAppContainerName(projectSlug, currentColor)
        : null;

      logStreamer.push({
        level: "info",
        message: `[deploy] Blue-green: ${currentColor ?? "none"} → ${newColor}`,
        task_run_id: ctx.taskRunId,
      });

      // 3. Clean up any stale container with the new color name
      await removeContainerIfExists(newContainerName);

      // 4. Start new app container
      logStreamer.push({
        level: "info",
        message: `[deploy] Starting container ${newContainerName} from ${ctx.imageTag}`,
        task_run_id: ctx.taskRunId,
      });

      const deployEnv: Record<string, string> = {
        ...(config.env ?? {}),
        PORT: String(appPort),
      };

      await runContainer({
        name: newContainerName,
        image: ctx.imageTag,
        network: DEPLOYER_NETWORK_NAME,
        env: deployEnv,
        labels: {
          "deployx.project": projectSlug,
          "deployx.role": "app",
          "deployx.color": newColor,
          "deployx.deployment": ctx.deploymentId,
          "deployx.runId": ctx.job.run_id,
          "deployx.healthPath": healthPath,
          "deployx.appPort": String(appPort),
        },
        detach: true,
        restart: "unless-stopped",
      });

      // 5. Health check (via docker exec — runner is on host, can't resolve container names)
      logStreamer.push({
        level: "info",
        message: `[deploy] Waiting for health check: ${newContainerName}:${appPort}${healthPath}`,
        task_run_id: ctx.taskRunId,
      });

      const healthResult = await waitForHealthyViaDocker({
        containerName: newContainerName,
        port: appPort,
        path: healthPath,
        timeoutMs: healthTimeoutS * 1000,
        retries: healthRetries,
        intervalMs: healthIntervalS * 1000,
        startPeriodMs: startPeriodS * 1000,
      });

      // Report health check to control plane
      await this.reportHealthCheck(ctx, healthResult.passed, {
        statusCode: healthResult.statusCode,
        responseTimeMs: healthResult.responseTimeMs,
        error: healthResult.error,
      });

      if (!healthResult.passed) {
        logStreamer.push({
          level: "error",
          message: `[deploy] Health check failed: ${healthResult.error}. Rolling back.`,
          task_run_id: ctx.taskRunId,
        });

        // Stop the unhealthy container
        await stopContainer(newContainerName, 5);
        await removeContainerIfExists(newContainerName);

        return {
          success: false,
          error: `Health check failed: ${healthResult.error}`,
        };
      }

      logStreamer.push({
        level: "info",
        message: `[deploy] Health check passed (${healthResult.responseTimeMs}ms)`,
        task_run_id: ctx.taskRunId,
      });

      // 6. Configure and reload nginx proxy
      const portAllocation = allocatePort(projectSlug);
      const proxyContainerName = this.getProxyContainerName(projectSlug);

      await this.ensureProxyContainer(
        proxyContainerName,
        portAllocation.proxyPort,
        projectSlug,
      );

      const nginxConfig = generateNginxConfig({
        listenPort: 80,
        upstream: { name: newContainerName, port: appPort },
        healthCheckPath: healthPath,
      });

      logStreamer.push({
        level: "info",
        message: `[deploy] Switching nginx proxy to ${newColor}`,
        task_run_id: ctx.taskRunId,
      });

      await writeNginxConfig(proxyContainerName, nginxConfig);
      await reloadNginx(proxyContainerName);

      // 7. Drain and stop old container
      if (oldContainerName && (await isContainerRunning(oldContainerName))) {
        logStreamer.push({
          level: "info",
          message: `[deploy] Draining old container ${oldContainerName} (${BLUE_GREEN_DRAIN_SECONDS}s)`,
          task_run_id: ctx.taskRunId,
        });

        await sleep(BLUE_GREEN_DRAIN_SECONDS * 1000);
        await stopContainer(oldContainerName, 10);
        await removeContainerIfExists(oldContainerName);
      }

      const publicUrl = `http://localhost:${portAllocation.proxyPort}`;
      logStreamer.push({
        level: "info",
        message: `[deploy] Deployment active at ${publicUrl}`,
        task_run_id: ctx.taskRunId,
      });

      return {
        success: true,
        publicUrl,
        hostPort: portAllocation.proxyPort,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logStreamer.push({
        level: "error",
        message: `[deploy] Deployment failed: ${message}`,
        task_run_id: ctx.taskRunId,
      });

      return { success: false, error: message };
    }
  }

  async rollback(
    ctx: DeployContext,
    targetRevisionImageTag: string,
  ): Promise<DeployResult> {
    ctx.logStreamer.push({
      level: "info",
      message: `[deploy] Rolling back to image: ${targetRevisionImageTag}`,
      task_run_id: ctx.taskRunId,
    });

    // Rollback is just a deploy with the previous revision's image
    const rollbackCtx: DeployContext = {
      ...ctx,
      imageTag: targetRevisionImageTag,
    };

    return this.deploy(rollbackCtx);
  }

  async stop(ctx: DeployContext): Promise<void> {
    const { projectSlug, logStreamer } = ctx;

    logStreamer.push({
      level: "info",
      message: `[deploy] Stopping all containers for ${projectSlug}`,
      task_run_id: ctx.taskRunId,
    });

    // Stop both blue and green app containers
    for (const color of ["blue", "green"] as const) {
      const name = this.getAppContainerName(projectSlug, color);
      await removeContainerIfExists(name);
    }

    // Stop proxy
    const proxyName = this.getProxyContainerName(projectSlug);
    await removeContainerIfExists(proxyName);
  }

  async getStatus(projectSlug: string): Promise<DeploymentStatus> {
    const blueRunning = await isContainerRunning(
      this.getAppContainerName(projectSlug, "blue"),
    );
    const greenRunning = await isContainerRunning(
      this.getAppContainerName(projectSlug, "green"),
    );

    if (blueRunning || greenRunning) return "active";
    return "stopped";
  }

  async getHealth(
    projectSlug: string,
    healthPath: string,
    port: number,
  ): Promise<HealthStatus> {
    const currentColor = await this.getCurrentColor(projectSlug);
    if (!currentColor) return "unknown";

    const containerName = this.getAppContainerName(projectSlug, currentColor);

    const { checkHealthViaDocker } = await import("./health-checker");
    const result = await checkHealthViaDocker(containerName, port, healthPath, 5000);

    if (result.passed) return "healthy";
    return "unhealthy";
  }

  async getLogs(
    containerName: string,
    tailLines = 100,
  ): Promise<readonly string[]> {
    return getContainerLogs(containerName, tailLines);
  }

  // ── Private Helpers ─────────────────────────────────────────

  private async getCurrentColor(
    projectSlug: string,
  ): Promise<Color | null> {
    // Check blue first, then green
    const blueName = this.getAppContainerName(projectSlug, "blue");
    if (await isContainerRunning(blueName)) return "blue";

    const greenName = this.getAppContainerName(projectSlug, "green");
    if (await isContainerRunning(greenName)) return "green";

    return null;
  }

  private getOppositeColor(current: Color | null): Color {
    if (current === "blue") return "green";
    return "blue";
  }

  private getAppContainerName(projectSlug: string, color: Color): string {
    return `deployx-${projectSlug}-${color}`;
  }

  private getProxyContainerName(projectSlug: string): string {
    return `deployx-proxy-${projectSlug}`;
  }

  private async ensureProxyContainer(
    proxyContainerName: string,
    hostPort: number,
    projectSlug: string,
  ): Promise<void> {
    const running = await isContainerRunning(proxyContainerName);
    if (running) return;

    // Remove any stopped proxy container
    await removeContainerIfExists(proxyContainerName);

    await runContainer({
      name: proxyContainerName,
      image: "nginx:alpine",
      network: DEPLOYER_NETWORK_NAME,
      ports: [{ host: hostPort, container: 80 }],
      labels: {
        "deployx.project": projectSlug,
        "deployx.role": "proxy",
      },
      detach: true,
      restart: "unless-stopped",
    });

    // Wait briefly for nginx to start
    await sleep(2000);
  }

  private async reportHealthCheck(
    ctx: DeployContext,
    passed: boolean,
    details: {
      statusCode: number | null;
      responseTimeMs: number;
      error?: string;
    },
  ): Promise<void> {
    try {
      await ctx.client.recordHealthCheck(
        ctx.job.run_id,
        ctx.deploymentId,
        {
          status: passed ? "pass" : "fail",
          status_code: details.statusCode ?? undefined,
          response_time_ms: details.responseTimeMs,
          error_message: details.error,
        },
      );
    } catch (err) {
      // Fire-and-forget — don't crash deployment over API error
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to report health check: ${msg}`);
    }
  }
}

// ── Utility ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
