import {
  DEPLOYER_NETWORK_NAME,
  ROLLING_DEFAULT_INSTANCES,
  ROLLING_MAX_UNAVAILABLE,
  ROLLING_OBSERVATION_SECONDS,
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
import {
  generateWeightedNginxConfig,
  writeNginxConfig,
  reloadNginx,
} from "./nginx-config";
import { waitForHealthyViaDocker, checkHealthViaDocker } from "./health-checker";

// ── Types ───────────────────────────────────────────────────────

interface RunningInstance {
  readonly ordinal: number;
  readonly containerName: string;
  readonly imageTag: string;
}

// ── DockerLocalRollingDeployer ───────────────────────────────────

export class DockerLocalRollingDeployer implements DeployerDriver {
  readonly name = "docker_local";

  async deploy(ctx: DeployContext): Promise<DeployResult> {
    const { logStreamer, config, projectSlug } = ctx;
    const appPort = config.port;
    const healthPath = config.health_check?.path ?? "/health";
    const healthRetries = config.health_check?.retries ?? 3;
    const healthTimeoutS = config.health_check?.timeout_seconds ?? 5;
    const healthIntervalS = config.health_check?.interval_seconds ?? 10;
    const startPeriodS = config.health_check?.start_period_seconds ?? 15;

    const instanceCount = config.rolling?.instances ?? ROLLING_DEFAULT_INSTANCES;
    const maxUnavailable = Math.min(
      config.rolling?.max_unavailable ?? ROLLING_MAX_UNAVAILABLE,
      instanceCount,
    );
    const observationSeconds = config.rolling?.observation_seconds ?? ROLLING_OBSERVATION_SECONDS;

    try {
      // 1. Ensure Docker network
      await ensureNetwork(DEPLOYER_NETWORK_NAME);

      // 2. Discover existing instances
      const existingInstances = await this.discoverInstances(projectSlug);

      // 3. First deploy — start all instances fresh
      if (existingInstances.length === 0) {
        return this.firstDeploy(ctx, instanceCount, appPort, healthPath, {
          retries: healthRetries,
          timeoutS: healthTimeoutS,
          intervalS: healthIntervalS,
          startPeriodS,
        });
      }

      logStreamer.push({
        level: "info",
        message: `[deploy:rolling] Rolling update: ${instanceCount} instances, maxUnavailable=${maxUnavailable}`,
        task_run_id: ctx.taskRunId,
      });

      const deployEnv: Record<string, string> = {
        ...(config.env ?? {}),
        PORT: String(appPort),
      };

      const portAllocation = allocatePort(projectSlug);
      const proxyContainerName = this.getProxyContainerName(projectSlug);
      await this.ensureProxyContainer(proxyContainerName, portAllocation.proxyPort, projectSlug);

      // Track which instances have been updated
      const updatedOrdinals: number[] = [];
      const previousImageTag = existingInstances[0]?.imageTag ?? null;

      // 4. Rolling update — replace instances respecting maxUnavailable
      for (let i = 0; i < instanceCount; i += maxUnavailable) {
        const batch = [];
        for (let j = 0; j < maxUnavailable && (i + j) < instanceCount; j++) {
          batch.push(i + j);
        }

        // Stop old instances in this batch
        for (const ordinal of batch) {
          const containerName = this.getInstanceContainerName(projectSlug, ordinal);
          if (await isContainerRunning(containerName)) {
            await stopContainer(containerName, 10);
            await removeContainerIfExists(containerName);
          }
        }

        // Start new instances in this batch
        for (const ordinal of batch) {
          const containerName = this.getInstanceContainerName(projectSlug, ordinal);

          logStreamer.push({
            level: "info",
            message: `[deploy:rolling] Updating instance ${ordinal} with ${ctx.imageTag}`,
            task_run_id: ctx.taskRunId,
          });

          await runContainer({
            name: containerName,
            image: ctx.imageTag,
            network: DEPLOYER_NETWORK_NAME,
            env: deployEnv,
            labels: this.buildLabels(ctx, ordinal, appPort, healthPath),
            detach: true,
            restart: "unless-stopped",
          });

          // Health check new instance (via docker exec — host can't resolve container names)
          const healthResult = await waitForHealthyViaDocker({
            containerName,
            port: appPort,
            path: healthPath,
            timeoutMs: healthTimeoutS * 1000,
            retries: healthRetries,
            intervalMs: healthIntervalS * 1000,
            startPeriodMs: startPeriodS * 1000,
          });

          await this.reportHealthCheck(ctx, healthResult.passed, {
            statusCode: healthResult.statusCode,
            responseTimeMs: healthResult.responseTimeMs,
            error: healthResult.error,
          });

          if (!healthResult.passed) {
            logStreamer.push({
              level: "error",
              message: `[deploy:rolling] Instance ${ordinal} unhealthy. Rolling back.`,
              task_run_id: ctx.taskRunId,
            });

            // Rollback all updated instances to previous image
            await this.rollbackInstances(
              ctx,
              [...updatedOrdinals, ordinal],
              previousImageTag,
              appPort,
              healthPath,
              deployEnv,
            );

            // Update nginx with all instances (rolled back + untouched)
            await this.updateNginxForAllInstances(
              proxyContainerName,
              projectSlug,
              instanceCount,
              appPort,
              healthPath,
            );

            await this.recordHealingEvent(ctx, "rolling_rollback", {
              failed_ordinal: ordinal,
              rolled_back_ordinals: [...updatedOrdinals, ordinal],
              error: healthResult.error,
            });

            return {
              success: false,
              error: `Instance ${ordinal} unhealthy: ${healthResult.error}`,
            };
          }

          updatedOrdinals.push(ordinal);

          await this.recordHealingEvent(ctx, "rolling_instance_updated", {
            ordinal,
            image_tag: ctx.imageTag,
            instances_updated: updatedOrdinals.length,
            instances_total: instanceCount,
          });
        }

        // Update nginx upstream with current state
        await this.updateNginxForAllInstances(
          proxyContainerName,
          projectSlug,
          instanceCount,
          appPort,
          healthPath,
        );

        // Observation period
        if (i + maxUnavailable < instanceCount) {
          logStreamer.push({
            level: "info",
            message: `[deploy:rolling] Observing for ${observationSeconds}s before next batch`,
            task_run_id: ctx.taskRunId,
          });
          await sleep(observationSeconds * 1000);
        }
      }

      const publicUrl = `http://localhost:${portAllocation.proxyPort}`;
      logStreamer.push({
        level: "info",
        message: `[deploy:rolling] All ${instanceCount} instances updated. Active at ${publicUrl}`,
        task_run_id: ctx.taskRunId,
      });

      return { success: true, publicUrl, hostPort: portAllocation.proxyPort };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logStreamer.push({
        level: "error",
        message: `[deploy:rolling] Deployment failed: ${message}`,
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
      message: `[deploy:rolling] Rolling back all instances to: ${targetRevisionImageTag}`,
      task_run_id: ctx.taskRunId,
    });

    return this.deploy({ ...ctx, imageTag: targetRevisionImageTag });
  }

  async stop(ctx: DeployContext): Promise<void> {
    const { projectSlug } = ctx;
    const instanceCount = ctx.config.rolling?.instances ?? ROLLING_DEFAULT_INSTANCES;

    for (let i = 0; i < instanceCount; i++) {
      await removeContainerIfExists(this.getInstanceContainerName(projectSlug, i));
    }
    await removeContainerIfExists(this.getProxyContainerName(projectSlug));
  }

  async getStatus(projectSlug: string): Promise<DeploymentStatus> {
    // Check if any instance is running
    for (let i = 0; i < 10; i++) {
      const name = this.getInstanceContainerName(projectSlug, i);
      if (await isContainerRunning(name)) return "active";
    }
    return "stopped";
  }

  async getHealth(
    projectSlug: string,
    healthPath: string,
    port: number,
  ): Promise<HealthStatus> {
    // Probe all discoverable instances, healthy if majority pass
    let total = 0;
    let healthy = 0;

    for (let i = 0; i < 10; i++) {
      const name = this.getInstanceContainerName(projectSlug, i);
      if (!(await isContainerRunning(name))) continue;
      total++;

      const result = await checkHealthViaDocker(name, port, healthPath, 5000);
      if (result.passed) healthy++;
    }

    if (total === 0) return "unknown";
    if (healthy === total) return "healthy";
    if (healthy > total / 2) return "degraded";
    return "unhealthy";
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
    instanceCount: number,
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

    logStreamer.push({
      level: "info",
      message: `[deploy:rolling] First deploy — starting ${instanceCount} instances from ${ctx.imageTag}`,
      task_run_id: ctx.taskRunId,
    });

    const deployEnv: Record<string, string> = {
      ...(config.env ?? {}),
      PORT: String(appPort),
    };

    for (let i = 0; i < instanceCount; i++) {
      const containerName = this.getInstanceContainerName(projectSlug, i);
      await removeContainerIfExists(containerName);

      await runContainer({
        name: containerName,
        image: ctx.imageTag,
        network: DEPLOYER_NETWORK_NAME,
        env: deployEnv,
        labels: this.buildLabels(ctx, i, appPort, healthPath),
        detach: true,
        restart: "unless-stopped",
      });

      const healthResult = await waitForHealthyViaDocker({
        containerName,
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
        // Clean up any started instances
        for (let j = 0; j <= i; j++) {
          await removeContainerIfExists(
            this.getInstanceContainerName(projectSlug, j),
          );
        }
        return { success: false, error: `Instance ${i} health check failed: ${healthResult.error}` };
      }
    }

    // Configure nginx with all instances
    const portAllocation = allocatePort(projectSlug);
    const proxyContainerName = this.getProxyContainerName(projectSlug);
    await this.ensureProxyContainer(proxyContainerName, portAllocation.proxyPort, projectSlug);

    await this.updateNginxForAllInstances(
      proxyContainerName,
      projectSlug,
      instanceCount,
      appPort,
      healthPath,
    );

    const publicUrl = `http://localhost:${portAllocation.proxyPort}`;
    return { success: true, publicUrl, hostPort: portAllocation.proxyPort };
  }

  private async discoverInstances(
    projectSlug: string,
  ): Promise<readonly RunningInstance[]> {
    const instances: RunningInstance[] = [];

    for (let i = 0; i < 10; i++) {
      const name = this.getInstanceContainerName(projectSlug, i);
      if (await isContainerRunning(name)) {
        instances.push({ ordinal: i, containerName: name, imageTag: "" });
      }
    }

    return instances;
  }

  private async rollbackInstances(
    ctx: DeployContext,
    ordinals: readonly number[],
    previousImageTag: string | null,
    appPort: number,
    healthPath: string,
    deployEnv: Record<string, string>,
  ): Promise<void> {
    if (!previousImageTag) return;

    for (const ordinal of ordinals) {
      const containerName = this.getInstanceContainerName(ctx.projectSlug, ordinal);
      await removeContainerIfExists(containerName);

      await runContainer({
        name: containerName,
        image: previousImageTag,
        network: DEPLOYER_NETWORK_NAME,
        env: deployEnv,
        labels: this.buildLabels(ctx, ordinal, appPort, healthPath),
        detach: true,
        restart: "unless-stopped",
      });
    }
  }

  private async updateNginxForAllInstances(
    proxyContainerName: string,
    projectSlug: string,
    instanceCount: number,
    appPort: number,
    healthCheckPath: string,
  ): Promise<void> {
    const upstreams = Array.from({ length: instanceCount }, (_, i) => ({
      name: this.getInstanceContainerName(projectSlug, i),
      port: appPort,
    }));

    const nginxConfig = generateWeightedNginxConfig({
      listenPort: 80,
      upstreams,
      healthCheckPath,
    });

    await writeNginxConfig(proxyContainerName, nginxConfig);
    await reloadNginx(proxyContainerName);
  }

  private buildLabels(
    ctx: DeployContext,
    ordinal: number,
    appPort: number,
    healthPath: string,
  ): Record<string, string> {
    return {
      "deployx.project": ctx.projectSlug,
      "deployx.role": "app",
      "deployx.strategy": "rolling",
      "deployx.ordinal": String(ordinal),
      "deployx.deployment": ctx.deploymentId,
      "deployx.runId": ctx.job.run_id,
      "deployx.healthPath": healthPath,
      "deployx.appPort": String(appPort),
    };
  }

  private getInstanceContainerName(projectSlug: string, ordinal: number): string {
    return `deployx-${projectSlug}-inst-${ordinal}`;
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
