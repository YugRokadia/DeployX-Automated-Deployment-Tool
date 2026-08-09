// ── Types ───────────────────────────────────────────────────────

export interface FlyApp {
  readonly name: string;
  readonly organization: { readonly slug: string };
}

export interface FlyMachine {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  readonly region: string;
  readonly config: FlyMachineConfig;
}

export interface FlyMachineConfig {
  readonly image: string;
  readonly env?: Record<string, string>;
  readonly services?: readonly FlyMachineService[];
  readonly guest?: {
    readonly cpu_kind?: string;
    readonly cpus?: number;
    readonly memory_mb?: number;
  };
}

export interface FlyMachineService {
  readonly ports: readonly FlyPort[];
  readonly protocol: string;
  readonly internal_port: number;
}

export interface FlyPort {
  readonly port: number;
  readonly handlers: readonly string[];
}

export interface FlyLogEntry {
  readonly timestamp: string;
  readonly message: string;
}

export interface FlyApiClientOptions {
  readonly apiToken: string;
  readonly baseUrl?: string;
}

// ── Client ──────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://api.machines.dev/v1";
const REQUEST_TIMEOUT_MS = 30_000;
const WAIT_STATE_POLL_MS = 3_000;
const WAIT_STATE_DEFAULT_TIMEOUT_MS = 120_000;

export class FlyApiClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;

  constructor(options: FlyApiClientOptions) {
    this.apiToken = options.apiToken;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  // ── Apps ─────────────────────────────────────────────────────

  async getApp(appName: string): Promise<FlyApp> {
    return this.request<FlyApp>("GET", `/apps/${appName}`);
  }

  // ── Machines ────────────────────────────────────────────────

  async createMachine(
    appName: string,
    config: FlyMachineConfig,
  ): Promise<FlyMachine> {
    return this.request<FlyMachine>("POST", `/apps/${appName}/machines`, {
      config,
    });
  }

  async getMachine(
    appName: string,
    machineId: string,
  ): Promise<FlyMachine> {
    return this.request<FlyMachine>(
      "GET",
      `/apps/${appName}/machines/${machineId}`,
    );
  }

  async updateMachine(
    appName: string,
    machineId: string,
    config: FlyMachineConfig,
  ): Promise<FlyMachine> {
    return this.request<FlyMachine>(
      "POST",
      `/apps/${appName}/machines/${machineId}`,
      { config },
    );
  }

  async stopMachine(
    appName: string,
    machineId: string,
  ): Promise<void> {
    await this.request(
      "POST",
      `/apps/${appName}/machines/${machineId}/stop`,
    );
  }

  async destroyMachine(
    appName: string,
    machineId: string,
  ): Promise<void> {
    await this.request(
      "DELETE",
      `/apps/${appName}/machines/${machineId}`,
    );
  }

  async listMachines(appName: string): Promise<readonly FlyMachine[]> {
    return this.request<readonly FlyMachine[]>(
      "GET",
      `/apps/${appName}/machines`,
    );
  }

  // ── Wait ────────────────────────────────────────────────────

  async waitForMachineState(
    appName: string,
    machineId: string,
    targetState: string,
    timeoutMs = WAIT_STATE_DEFAULT_TIMEOUT_MS,
  ): Promise<FlyMachine> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const machine = await this.getMachine(appName, machineId);
      if (machine.state === targetState) {
        return machine;
      }
      if (machine.state === "failed" || machine.state === "destroyed") {
        throw new Error(
          `Machine ${machineId} entered terminal state: ${machine.state}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, WAIT_STATE_POLL_MS));
    }

    throw new Error(
      `Machine ${machineId} did not reach state "${targetState}" within ${timeoutMs}ms`,
    );
  }

  // ── Logs ────────────────────────────────────────────────────

  async getMachineLogs(
    appName: string,
    machineId: string,
    limit = 100,
  ): Promise<readonly FlyLogEntry[]> {
    const data = await this.request<{ logs: readonly FlyLogEntry[] }>(
      "GET",
      `/apps/${appName}/machines/${machineId}/logs?limit=${limit}`,
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
          `Fly API ${method} ${path} failed (${response.status}): ${text}`,
        );
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
