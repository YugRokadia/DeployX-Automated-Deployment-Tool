import type { RunnerApiClient, JobPayload } from "../api-client";
import type { LogStreamer } from "../logging/log-streamer";
import type { DeployConfig } from "@deployx/shared";
import type { DeploymentStatus, HealthStatus } from "@deployx/shared";

// ── Deploy Context ──────────────────────────────────────────────

export interface DeployContext {
  readonly client: RunnerApiClient;
  readonly logStreamer: LogStreamer;
  readonly job: JobPayload;
  readonly deploymentId: string;
  readonly revisionId: string;
  readonly imageTag: string;
  readonly config: DeployConfig;
  readonly projectSlug: string;
  readonly taskRunId?: string;
  readonly secrets: Record<string, string>;
}

// ── Deploy Result ───────────────────────────────────────────────

export interface DeployResult {
  readonly success: boolean;
  readonly publicUrl?: string;
  readonly hostPort?: number;
  readonly error?: string;
}

// ── Deployer Driver Interface ───────────────────────────────────

export interface DeployerDriver {
  readonly name: string;

  deploy(ctx: DeployContext): Promise<DeployResult>;

  rollback(
    ctx: DeployContext,
    targetRevisionImageTag: string,
  ): Promise<DeployResult>;

  stop(ctx: DeployContext): Promise<void>;

  getStatus(projectSlug: string): Promise<DeploymentStatus>;

  getHealth(projectSlug: string, healthPath: string, port: number): Promise<HealthStatus>;

  getLogs(containerName: string, tailLines?: number): Promise<readonly string[]>;
}
