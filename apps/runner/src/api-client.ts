import type { RunnerConfig } from "./config";

interface SystemInfo {
  readonly os: string;
  readonly arch: string;
  readonly version: string;
}

export interface JobPayload {
  readonly run_id: string;
  readonly project_id: string;
  readonly project_name: string;
  readonly project_slug: string;
  readonly git_repo_url: string;
  readonly git_branch: string;
  readonly git_sha: string | null;
  readonly git_clone_token: string | null;
  readonly dockerfile_path: string;
  readonly build_context: string;
  readonly deploy_target: string;
  readonly config_json: Record<string, unknown> | null;
}

export interface ClaimedStepRun {
  readonly id: string;
  readonly step_name: string;
  readonly sort_order: number;
}

export interface ClaimedTaskRun {
  readonly id: string;
  readonly task_name: string;
  readonly step_runs: readonly ClaimedStepRun[];
}

export interface ClaimedJob {
  readonly id: string;
  readonly project_id: string;
  readonly git_branch: string;
  readonly git_sha: string | null;
  readonly config_json: Record<string, unknown> | null;
  readonly task_runs: readonly ClaimedTaskRun[];
}

export interface LogEntry {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
  readonly task_run_id?: string;
  readonly step_run_id?: string;
  readonly timestamp?: string;
}

export class RunnerApiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: RunnerConfig) {
    this.baseUrl = config.control_plane_url.replace(/\/$/, "");
    this.token = config.token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(
        `API error ${response.status}: expected JSON but got ${contentType || "unknown content-type"} (${text.slice(0, 200)})`,
      );
    }

    const data = await response.json() as T & { error?: string };

    if (!response.ok) {
      throw new Error(
        `API error ${response.status}: ${data.error ?? response.statusText}`,
      );
    }

    return data;
  }

  async register(
    token: string,
    name: string,
    systemInfo: SystemInfo,
  ): Promise<{ runner_id: string }> {
    // Registration uses a different base URL pattern — the token is in the body, not the header
    const url = `${this.baseUrl}/api/runner/register`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, system_info: systemInfo }),
    });

    const data = await response.json() as { runner_id: string; error?: string };
    if (!response.ok) {
      throw new Error(`Registration failed: ${data.error ?? response.statusText}`);
    }

    return data;
  }

  async heartbeat(): Promise<void> {
    await this.request("POST", "/api/runner/heartbeat", {});
  }

  async pollJob(): Promise<JobPayload | null> {
    const data = await this.request<{ job: JobPayload | null }>(
      "GET",
      "/api/runner/jobs",
    );
    return data.job;
  }

  async claimJob(runId: string): Promise<ClaimedJob> {
    const data = await this.request<{ claimed: boolean; run: ClaimedJob }>(
      "POST",
      `/api/runner/jobs/${runId}/claim`,
    );
    return data.run;
  }

  async reportStatus(
    runId: string,
    payload: {
      readonly scope: "pipeline" | "task" | "step";
      readonly status: string;
      readonly task_name?: string;
      readonly step_name?: string;
      readonly exit_code?: number;
      readonly started_at?: string;
      readonly finished_at?: string;
    },
  ): Promise<void> {
    await this.request("POST", `/api/runner/jobs/${runId}/status`, payload);
  }

  async sendLogs(runId: string, logs: readonly LogEntry[]): Promise<void> {
    if (logs.length === 0) return;
    await this.request("POST", `/api/runner/jobs/${runId}/logs`, { logs });
  }

  async recordImage(
    runId: string,
    image: {
      readonly registry: string;
      readonly repository: string;
      readonly tag: string;
      readonly digest?: string;
      readonly size_bytes?: number;
    },
  ): Promise<void> {
    await this.request("POST", `/api/runner/jobs/${runId}/images`, image);
  }

  // ── Deployment Methods ──────────────────────────────────────

  async createDeployment(
    runId: string,
    payload: {
      readonly strategy: string;
      readonly deploy_target: string;
      readonly image_tag: string;
      readonly image_digest?: string;
    },
  ): Promise<{ deployment_id: string; revision_id: string }> {
    return this.request(
      "POST",
      `/api/runner/jobs/${runId}/deployments`,
      payload,
    );
  }

  async updateDeployment(
    runId: string,
    deploymentId: string,
    payload: {
      readonly status: string;
      readonly health_status?: string;
    },
  ): Promise<void> {
    await this.request(
      "PATCH",
      `/api/runner/jobs/${runId}/deployments/${deploymentId}`,
      payload,
    );
  }

  async recordHealingEvent(
    runId: string,
    deploymentId: string,
    payload: {
      readonly event_type: string;
      readonly attempt_number?: number;
      readonly container_name?: string;
      readonly details?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.request(
      "POST",
      `/api/runner/jobs/${runId}/deployments/${deploymentId}/healing`,
      payload,
    );
  }

  async recordHealthCheck(
    runId: string,
    deploymentId: string,
    payload: {
      readonly status: "pass" | "fail";
      readonly response_time_ms?: number;
      readonly status_code?: number;
      readonly error_message?: string;
    },
  ): Promise<void> {
    await this.request(
      "POST",
      `/api/runner/jobs/${runId}/deployments/${deploymentId}/health`,
      payload,
    );
  }

  // ── Secrets & Status Methods ─────────────────────────────────

  async getSecrets(
    runId: string,
  ): Promise<Record<string, string>> {
    const data = await this.request<{ secrets: Record<string, string> }>(
      "GET",
      `/api/runner/jobs/${runId}/secrets`,
    );
    return data.secrets;
  }

  async getRunStatus(runId: string): Promise<{ status: string }> {
    return this.request<{ status: string }>(
      "GET",
      `/api/runner/jobs/${runId}/status`,
    );
  }
}
