import {
  DEPLOYER_NETWORK_NAME,
  CANARY_DEFAULT_STAGES,
  CANARY_OBSERVATION_SECONDS,
  CANARY_DRAIN_SECONDS,
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
  listContainersByLabel,
  inspectContainer,
} from "./container-manager";
import { allocatePort } from "./port-allocator";
import {
  generateWeightedNginxConfig,
  calculateCanaryWeights,
  writeNginxConfig,
  reloadNginx,
} from "./nginx-config";
import { waitForHealthyViaDocker, checkHealthViaDocker } from "./health-checker";

// ── DockerLocalCanaryDeployer ───────────────────────────────────

export class DockerLocalCanaryDeployer implements DeployerDriver {
  readonly name = "docker_local";

  async deploy(ctx: DeployContext): Promise<DeployResult> {
    const { logStreamer, config, projectSlug } = ctx;
    const appPort = config.port;
    const healthPath = config.health_check?.path ?? "/health";
    const healthRetries = config.health_check?.retries ?? 3;
    const healthTimeoutS = config.health_check?.timeout_seconds ?? 5;
    const healthIntervalS = config.health_check?.interval_seconds ?? 10;
    const startPeriodS = config.health_check?.start_period_seconds ?? 15;

    const stages = config.canary?.stages ?? [...CANARY_DEFAULT_STAGES];
    const observationSeconds = config.canary?.observation_seconds ?? CANARY_OBSERVATION_SECONDS;

    try {
      // 1. Ensure Docker network
      await ensureNetwork(DEPLOYER_NETWORK_NAME);

      const stableContainerName = this.getStableContainerName(projectSlug);
      const canaryContainerName = this.getCanaryContainerName(projectSlug);
      const proxyContainerName = this.getProxyContainerName(projectSlug);

      // 2. Check if a stable container already exists
      const stableRunning = await isContainerRunning(stableContainerName);

      // 3. If no stable exists — first deploy, run as single container
      if (!stableRunning) {
        return this.firstDeploy(ctx, appPort, healthPath, {
          retries: healthRetries,
          timeoutS: healthTimeoutS,
          intervalS: healthIntervalS,
          startPeriodS,
        });
      }

      // 4. Clean up any stale canary container
      await removeContainerIfExists(canaryContainerName);

      // 5. Start canary container with new image
      logStreamer.push({
        level: "info",
        message: `[deploy:canary] Starting canary container from ${ctx.imageTag}`,
        task_run_id: ctx.taskRunId,
      });

      const deployEnv: Record<string, string> = {
        ...(config.env ?? {}),
        PORT: String(appPort),
      };

      await runContainer({
        name: canaryContainerName,
        image: ctx.imageTag,
        network: DEPLOYER_NETWORK_NAME,
        env: deployEnv,
        labels: this.buildLabels(ctx, "canary", appPort, healthPath),
        detach: true,
        restart: "unless-stopped",
      });

      // 6. Initial health check on canary (via docker exec — host can't resolve container names)
      const initialHealth = await waitForHealthyViaDocker({
        containerName: canaryContainerName,
        port: appPort,
        path: healthPath,
        timeoutMs: healthTimeoutS * 1000,
        retries: healthRetries,
        intervalMs: healthIntervalS * 1000,
        startPeriodMs: startPeriodS * 1000,
      });

      await this.reportHealthCheck(ctx, initialHealth.passed, {
        statusCode: initialHealth.statusCode,
        responseTimeMs: initialHealth.responseTimeMs,
        error: initialHealth.error,
      });

      if (!initialHealth.passed) {
        logStreamer.push({
          level: "error",
          message: `[deploy:canary] Canary health check failed: ${initialHealth.error}`,
          task_run_id: ctx.taskRunId,
        });
        await stopContainer(canaryContainerName, 5);
        await removeContainerIfExists(canaryContainerName);
        return { success: false, error: `Canary health check failed: ${initialHealth.error}` };
      }

      logStreamer.push({
        level: "info",
        message: `[deploy:canary] Canary healthy. Starting promotion: ${stages.join("% → ")}%`,
        task_run_id: ctx.taskRunId,
      });

      // 7. Ensure proxy container exists
      const portAllocation = allocatePort(projectSlug);
      await this.ensureProxyContainer(proxyContainerName, portAllocation.proxyPort, projectSlug);

      // 8. Stage-by-stage promotion
      for (const percentage of stages) {
        logStreamer.push({
          level: "info",
          message: `[deploy:canary] Promoting to ${percentage}% traffic`,
          task_run_id: ctx.taskRunId,
        });

        // Calculate weights and update nginx
        if (percentage >= 100) {
          // At 100%, route everything to canary
          const nginxConfig = generateWeightedNginxConfig({
            listenPort: 80,
            upstreams: [{ name: canaryContainerName, port: appPort }],
            healthCheckPath: healthPath,
          });
          await writeNginxConfig(proxyContainerName, nginxConfig);
        } else {
          const weights = calculateCanaryWeights(percentage);
          const nginxConfig = generateWeightedNginxConfig({
            listenPort: 80,
            upstreams: [
              { name: stableContainerName, port: appPort, weight: weights.stableWeight },
              { name: canaryContainerName, port: appPort, weight: weights.canaryWeight },
            ],
            healthCheckPath: healthPath,
          });
          await writeNginxConfig(proxyContainerName, nginxConfig);
        }
        await reloadNginx(proxyContainerName);

        // Record promotion event
        await this.recordHealingEvent(ctx, "canary_promotion", {
          percentage,
          image_tag: ctx.imageTag,
        });

        // Observation period — wait and health-check during it
        await sleep(observationSeconds * 1000);

        // Health check canary during observation
        const observationHealth = await checkHealthViaDocker(canaryContainerName, appPort, healthPath, healthTimeoutS * 1000);

        if (!observationHealth.passed) {
          // Auto-rollback: restore 100% stable
          logStreamer.push({
            level: "error",
            message: `[deploy:canary] Canary unhealthy at ${percentage}%. Rolling back to stable.`,
            task_run_id: ctx.taskRunId,
          });

          const rollbackConfig = generateWeightedNginxConfig({
            listenPort: 80,
            upstreams: [{ name: stableContainerName, port: appPort }],
            healthCheckPath: healthPath,
          });
          await writeNginxConfig(proxyContainerName, rollbackConfig);
          await reloadNginx(proxyContainerName);

          await stopContainer(canaryContainerName, 5);
          await removeContainerIfExists(canaryContainerName);

          await this.recordHealingEvent(ctx, "canary_rollback", {
            failed_at_percentage: percentage,
            error: observationHealth.error,
          });

          return {
            success: false,
            error: `Canary unhealthy at ${percentage}%: ${observationHealth.error}`,
          };
        }

        logStreamer.push({
          level: "info",
          message: `[deploy:canary] ${percentage}% observation passed`,
          task_run_id: ctx.taskRunId,
        });
      }

      // 9. Promotion complete — canary becomes new stable
      logStreamer.push({
        level: "info",
        message: `[deploy:canary] Promotion complete. Replacing stable with canary image.`,
        task_run_id: ctx.taskRunId,
      });

      // Stop old stable
      await sleep(CANARY_DRAIN_SECONDS * 1000);
      await stopContainer(stableContainerName, 10);
      await removeContainerIfExists(stableContainerName);

      // Stop canary
      await stopContainer(canaryContainerName, 5);
      await removeContainerIfExists(canaryContainerName);

      // Start new stable with the canary's image
      await runContainer({
        name: stableContainerName,
        image: ctx.imageTag,
        network: DEPLOYER_NETWORK_NAME,
        env: deployEnv,
        labels: this.buildLabels(ctx, "stable", appPort, healthPath),
        detach: true,
        restart: "unless-stopped",
      });

      // Wait for new stable to be healthy
      await waitForHealthyViaDocker({
        containerName: stableContainerName,
        port: appPort,
        path: healthPath,
        timeoutMs: healthTimeoutS * 1000,
        retries: healthRetries,
        intervalMs: healthIntervalS * 1000,
        startPeriodMs: startPeriodS * 1000,
      });

      // Point nginx to new stable
      const finalConfig = generateWeightedNginxConfig({
        listenPort: 80,
        upstreams: [{ name: stableContainerName, port: appPort }],
        healthCheckPath: healthPath,
      });
      await writeNginxConfig(proxyContainerName, finalConfig);
      await reloadNginx(proxyContainerName);

      const publicUrl = `http://localhost:${portAllocation.proxyPort}`;
      logStreamer.push({
        level: "info",
        message: `[deploy:canary] Deployment active at ${publicUrl}`,
        task_run_id: ctx.taskRunId,
      });

      return { success: true, publicUrl, hostPort: portAllocation.proxyPort };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logStreamer.push({
        level: "error",
        message: `[deploy:canary] Deployment failed: ${message}`,
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
      message: `[deploy:canary] Rolling back to image: ${targetRevisionImageTag}`,
      task_run_id: ctx.taskRunId,
    });

    return this.deploy({ ...ctx, imageTag: targetRevisionImageTag });
  }

  async stop(ctx: DeployContext): Promise<void> {
    const { projectSlug } = ctx;
    await removeContainerIfExists(this.getStableContainerName(projectSlug));
    await removeContainerIfExists(this.getCanaryContainerName(projectSlug));
    await removeContainerIfExists(this.getProxyContainerName(projectSlug));
  }

  async getStatus(projectSlug: string): Promise<DeploymentStatus> {
    const stableRunning = await isContainerRunning(this.getStableContainerName(projectSlug));
    return stableRunning ? "active" : "stopped";
  }

  async getHealth(
    projectSlug: string,
    healthPath: string,
    port: number,
  ): Promise<HealthStatus> {
    const stableContainerName = this.getStableContainerName(projectSlug);
    if (!(await isContainerRunning(stableContainerName))) return "unknown";

    const result = await checkHealthViaDocker(stableContainerName, port, healthPath, 5000);
    return result.passed ? "healthy" : "unhealthy";
  }

  async getLogs(
    containerName: string,
    tailLines = 100,
  ): Promise<readonly string[]> {
    return getContainerLogs(containerName, tailLines);
  }

  // ── Private Helpers ─────────────────────────────────────────

  private async firstDeploy(
    ctx: DeployContext,
    appPort: number,
    healthPath: string,
    healthConfig: {
      readonly retries: number;
      readonly timeoutS: number;
      readonly intervalS: number;
      readonly startPeriodS: number;
    },
  ): Promise<DeployResult> {
    const { logStreamer, config, projectSlug } = ctx;
    const stableContainerName = this.getStableContainerName(projectSlug);

    logStreamer.push({
      level: "info",
      message: `[deploy:canary] First deploy — creating stable container from ${ctx.imageTag}`,
      task_run_id: ctx.taskRunId,
    });

    const deployEnv: Record<string, string> = {
      ...(config.env ?? {}),
      PORT: String(appPort),
    };

    await runContainer({
      name: stableContainerName,
      image: ctx.imageTag,
      network: DEPLOYER_NETWORK_NAME,
      env: deployEnv,
      labels: this.buildLabels(ctx, "stable", appPort, healthPath),
      detach: true,
      restart: "unless-stopped",
    });

    const healthResult = await waitForHealthyViaDocker({
      containerName: stableContainerName,
      port: appPort,
      path: healthPath,
      timeoutMs: healthConfig.timeoutS * 1000,
      retries: healthConfig.retries,
      intervalMs: healthConfig.intervalS * 1000,
      startPeriodMs: healthConfig.startPeriodS * 1000,
    });

    await this.reportHealthCheck(ctx, healthResult.passed, {
      statusCode: healthResult.statusCode,
      responseTimeMs: healthResult.responseTimeMs,
      error: healthResult.error,
    });

    if (!healthResult.passed) {
      await stopContainer(stableContainerName, 5);
      await removeContainerIfExists(stableContainerName);
      return { success: false, error: `Health check failed: ${healthResult.error}` };
    }

    const portAllocation = allocatePort(projectSlug);
    const proxyContainerName = this.getProxyContainerName(projectSlug);
    await this.ensureProxyContainer(proxyContainerName, portAllocation.proxyPort, projectSlug);

    const nginxConfig = generateWeightedNginxConfig({
      listenPort: 80,
      upstreams: [{ name: stableContainerName, port: appPort }],
      healthCheckPath: healthPath,
    });
    await writeNginxConfig(proxyContainerName, nginxConfig);
    await reloadNginx(proxyContainerName);

    const publicUrl = `http://localhost:${portAllocation.proxyPort}`;
    return { success: true, publicUrl, hostPort: portAllocation.proxyPort };
  }

  private buildLabels(
    ctx: DeployContext,
    canaryRole: "stable" | "canary",
    appPort: number,
    healthPath: string,
  ): Record<string, string> {
    return {
      "deployx.project": ctx.projectSlug,
      "deployx.role": "app",
      "deployx.strategy": "canary",
      "deployx.canaryRole": canaryRole,
      "deployx.deployment": ctx.deploymentId,
      "deployx.runId": ctx.job.run_id,
      "deployx.healthPath": healthPath,
      "deployx.appPort": String(appPort),
    };
  }

  private getStableContainerName(projectSlug: string): string {
    return `deployx-${projectSlug}-stable`;
  }

  private getCanaryContainerName(projectSlug: string): string {
    return `deployx-${projectSlug}-canary`;
  }

  private getProxyContainerName(projectSlug: string): string {
    return `deployx-proxy-${projectSlug}`;
  }

  private async ensureProxyContainer(
    proxyContainerName: string,
    hostPort: number,
    projectSlug: string,
  ): Promise<void> {
    if (await isContainerRunning(proxyContainerName)) return;
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
      await ctx.client.recordHealthCheck(ctx.job.run_id, ctx.deploymentId, {
        status: passed ? "pass" : "fail",
        status_code: details.statusCode ?? undefined,
        response_time_ms: details.responseTimeMs,
        error_message: details.error,
      });
    } catch {
      // Fire-and-forget
    }
  }

  private async recordHealingEvent(
    ctx: DeployContext,
    eventType: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await ctx.client.recordHealingEvent(ctx.job.run_id, ctx.deploymentId, {
        event_type: eventType,
        details,
      });
    } catch {
      // Fire-and-forget
    }
  }
}

// ── Utility ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
