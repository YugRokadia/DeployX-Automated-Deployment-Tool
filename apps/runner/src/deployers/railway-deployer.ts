import type { DeployerDriver, DeployContext, DeployResult } from "./deployer-interface";
import type { DeploymentStatus, HealthStatus } from "@deployx/shared";
import { RailwayApiClient } from "./clients";
import type { RailwayService } from "./clients";
import { waitForHealthy, checkHealth } from "./health-checker";

// ── Constants ───────────────────────────────────────────────────

const DEPLOY_POLL_INTERVAL_MS = 10_000;
const DEPLOY_TIMEOUT_MS = 300_000; // 5 minutes
const HEALTH_CHECK_TIMEOUT_MS = 5_000;
const HEALTH_CHECK_RETRIES = 5;
const HEALTH_CHECK_INTERVAL_MS = 3_000;
const HEALTH_CHECK_START_PERIOD_MS = 5_000;

// ── Railway Deployer ────────────────────────────────────────────

export class RailwayDeployer implements DeployerDriver {
  readonly name = "railway";

  // Cached state from last deploy (for getStatus/getLogs within same run)
  private cachedClient: RailwayApiClient | null = null;
  private cachedDeploymentId: string | null = null;
  private cachedServiceId: string | null = null;
  private cachedPublicUrl: string | null = null;

  // ── Deploy ──────────────────────────────────────────────────

  async deploy(ctx: DeployContext): Promise<DeployResult> {
    const { logStreamer, taskRunId } = ctx;

    try {
      const railwayClient = this.getApiClient(ctx);
      const projectId = this.getProjectId(ctx);
      this.cachedClient = railwayClient;

      logStreamer.push({
        level: "info",
        message: `[railway] Starting deployment: ${ctx.imageTag}`,
        task_run_id: taskRunId,
      });

      // Validate image looks registry-qualified
      this.validateImageTag(ctx.imageTag);

      // Find or create service
      const serviceName = `deployx-${ctx.projectSlug}`;
      const service = await this.findOrCreateService(
        railwayClient,
        projectId,
        serviceName,
      );
      this.cachedServiceId = service.id;

      logStreamer.push({
        level: "info",
        message: `[railway] Using service: ${service.name} (${service.id})`,
        task_run_id: taskRunId,
      });

      // Create deployment
      const deployment = await railwayClient.createDeployment(
        service.id,
        ctx.imageTag,
        ctx.config.env,
      );
      this.cachedDeploymentId = deployment.id;

      logStreamer.push({
        level: "info",
        message: `[railway] Deployment created: ${deployment.id}`,
        task_run_id: taskRunId,
      });

      // Poll for deployment status
      const finalDeployment = await this.waitForDeployment(
        railwayClient,
        deployment.id,
      );

      if (finalDeployment.status !== "SUCCESS") {
        return {
          success: false,
          error: `Railway deployment failed with status: ${finalDeployment.status}`,
        };
      }

      const publicUrl = finalDeployment.staticUrl
        ? `https://${finalDeployment.staticUrl}`
        : undefined;
      this.cachedPublicUrl = publicUrl ?? null;

      logStreamer.push({
        level: "info",
        message: `[railway] Deployment live${publicUrl ? ` at ${publicUrl}` : ""}`,
        task_run_id: taskRunId,
      });

      // Health check against public URL
      if (publicUrl) {
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
      }

      return { success: true, publicUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStreamer.push({
        level: "error",
        message: `[railway] ${msg}`,
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
      message: `[railway] Rolling back to ${targetRevisionImageTag}`,
      task_run_id: ctx.taskRunId,
    });

    return this.deploy({
      ...ctx,
      imageTag: targetRevisionImageTag,
    });
  }

  // ── Stop ────────────────────────────────────────────────────

  async stop(ctx: DeployContext): Promise<void> {
    const railwayClient = this.cachedClient ?? this.getApiClient(ctx);
    const deploymentId = this.cachedDeploymentId;

    if (deploymentId) {
      try {
        await railwayClient.cancelDeployment(deploymentId);
        ctx.logStreamer.push({
          level: "info",
          message: `[railway] Deployment ${deploymentId} cancelled`,
          task_run_id: ctx.taskRunId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.logStreamer.push({
          level: "warn",
          message: `[railway] Failed to cancel deployment: ${msg}`,
          task_run_id: ctx.taskRunId,
        });
      }
    }
  }

  // ── Status ──────────────────────────────────────────────────

  async getStatus(_projectSlug: string): Promise<DeploymentStatus> {
    if (!this.cachedClient || !this.cachedDeploymentId) {
      return "unknown" as DeploymentStatus;
    }

    try {
      const deployment = await this.cachedClient.getDeployment(
        this.cachedDeploymentId,
      );
      return mapRailwayStatus(deployment.status);
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
    if (!this.cachedPublicUrl) {
      return "unknown" as HealthStatus;
    }

    try {
      const result = await checkHealth(
        `${this.cachedPublicUrl}${healthPath}`,
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
    if (!this.cachedClient || !this.cachedDeploymentId) {
      return [];
    }

    try {
      const logs = await this.cachedClient.getDeploymentLogs(
        this.cachedDeploymentId,
        tailLines,
      );
      return logs.map((l) => `${l.timestamp} ${l.message}`);
    } catch {
      return [];
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  private getApiClient(ctx: DeployContext): RailwayApiClient {
    const token = ctx.secrets.RAILWAY_API_TOKEN;
    if (!token) {
      throw new Error(
        "RAILWAY_API_TOKEN secret required. Add it in Project Settings → Secrets.",
      );
    }
    return new RailwayApiClient({ apiToken: token });
  }

  private getProjectId(ctx: DeployContext): string {
    const projectId =
      ctx.secrets.RAILWAY_PROJECT_ID ?? ctx.config.railway?.project_id;
    if (!projectId) {
      throw new Error(
        "RAILWAY_PROJECT_ID required. Set it as a project secret or in deploy config railway.project_id.",
      );
    }
    return projectId;
  }

  private validateImageTag(imageTag: string): void {
    if (!imageTag.includes("/")) {
      throw new Error(
        `External deployers require a registry-qualified image (e.g., ghcr.io/user/app:tag), got: ${imageTag}`,
      );
    }
  }

  private async findOrCreateService(
    client: RailwayApiClient,
    projectId: string,
    serviceName: string,
  ): Promise<RailwayService> {
    const services = await client.listServices(projectId);
    const existing = services.find((s) => s.name === serviceName);

    if (existing) {
      return existing;
    }

    return client.createService(projectId, serviceName);
  }

  private async waitForDeployment(
    client: RailwayApiClient,
    deploymentId: string,
  ): Promise<{ readonly status: string; readonly staticUrl?: string }> {
    const start = Date.now();

    while (Date.now() - start < DEPLOY_TIMEOUT_MS) {
      const deployment = await client.getDeployment(deploymentId);

      if (
        deployment.status === "SUCCESS" ||
        deployment.status === "FAILED" ||
        deployment.status === "CANCELLED"
      ) {
        return deployment;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, DEPLOY_POLL_INTERVAL_MS),
      );
    }

    return { status: "TIMEOUT" };
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

// ── Status Mapping ──────────────────────────────────────────────

function mapRailwayStatus(status: string): DeploymentStatus {
  switch (status) {
    case "SUCCESS":
      return "active";
    case "BUILDING":
    case "DEPLOYING":
    case "INITIALIZING":
      return "deploying";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "stopped";
    default:
      return "pending";
  }
}
