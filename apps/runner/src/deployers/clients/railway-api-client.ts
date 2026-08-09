// ── Types ───────────────────────────────────────────────────────

export interface RailwayProject {
  readonly id: string;
  readonly name: string;
}

export interface RailwayService {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
}

export interface RailwayDeployment {
  readonly id: string;
  readonly status: string;
  readonly serviceId: string;
  readonly staticUrl?: string;
}

export interface RailwayDeploymentLog {
  readonly timestamp: string;
  readonly message: string;
}

export interface RailwayApiClientOptions {
  readonly apiToken: string;
  readonly baseUrl?: string;
}

// ── Client ──────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://api.railway.com/v2";
const REQUEST_TIMEOUT_MS = 30_000;

export class RailwayApiClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;

  constructor(options: RailwayApiClientOptions) {
    this.apiToken = options.apiToken;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  // ── Projects ────────────────────────────────────────────────

  async getProject(projectId: string): Promise<RailwayProject> {
    return this.request<RailwayProject>("GET", `/projects/${projectId}`);
  }

  // ── Services ────────────────────────────────────────────────

  async listServices(
    projectId: string,
  ): Promise<readonly RailwayService[]> {
    const data = await this.request<{ services: readonly RailwayService[] }>(
      "GET",
      `/projects/${projectId}/services`,
    );
    return data.services;
  }

  async createService(
    projectId: string,
    name: string,
  ): Promise<RailwayService> {
    return this.request<RailwayService>("POST", `/projects/${projectId}/services`, {
      name,
    });
  }

  async getService(serviceId: string): Promise<RailwayService | null> {
    try {
      return await this.request<RailwayService>("GET", `/services/${serviceId}`);
    } catch {
      return null;
    }
  }

  // ── Deployments ─────────────────────────────────────────────

  async createDeployment(
    serviceId: string,
    imageTag: string,
    env?: Record<string, string>,
  ): Promise<RailwayDeployment> {
    return this.request<RailwayDeployment>("POST", `/services/${serviceId}/deployments`, {
      image: imageTag,
      ...(env ? { env } : {}),
    });
  }

  async getDeployment(deploymentId: string): Promise<RailwayDeployment> {
    return this.request<RailwayDeployment>(
      "GET",
      `/deployments/${deploymentId}`,
    );
  }

  async cancelDeployment(deploymentId: string): Promise<void> {
    await this.request("DELETE", `/deployments/${deploymentId}`);
  }

  // ── Logs ────────────────────────────────────────────────────

  async getDeploymentLogs(
    deploymentId: string,
    limit = 100,
  ): Promise<readonly RailwayDeploymentLog[]> {
    const data = await this.request<{ logs: readonly RailwayDeploymentLog[] }>(
      "GET",
      `/deployments/${deploymentId}/logs?limit=${limit}`,
    );
    return data.logs;
  }

  // ── HTTP Layer ──────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "Authorization": `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Railway API ${method} ${path} failed (${response.status}): ${text}`,
        );
      }

      // DELETE returns no body
      if (response.status === 204 || method === "DELETE") {
        return undefined as T;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
