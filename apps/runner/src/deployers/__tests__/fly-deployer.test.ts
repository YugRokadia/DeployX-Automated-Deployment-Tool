import { describe, it, expect, vi, beforeEach } from "vitest";
import { FlyDeployer } from "../fly-deployer";
import type { DeployContext } from "../deployer-interface";

// Mock all dependencies
vi.mock("../clients", () => ({
  FlyApiClient: vi.fn(),
}));

vi.mock("../health-checker", () => ({
  waitForHealthy: vi.fn(),
  checkHealth: vi.fn(),
}));

// Fast-forward all sleeps
vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: () => void) => {
  fn();
  return 0 as unknown as ReturnType<typeof setTimeout>;
});

const { FlyApiClient: MockFlyApiClient } = await import("../clients");
const { waitForHealthy, checkHealth } = await import("../health-checker");

// ── Helpers ──────────────────────────────────────────────────────

function createMockClient() {
  return {
    recordHealthCheck: vi.fn().mockResolvedValue(undefined),
    recordHealingEvent: vi.fn().mockResolvedValue(undefined),
    updateDeployment: vi.fn().mockResolvedValue(undefined),
  } as unknown as import("../../api-client").RunnerApiClient;
}

function createCtx(overrides?: Partial<DeployContext>): DeployContext {
  return {
    client: createMockClient(),
    logStreamer: { push: vi.fn() } as any,
    job: { run_id: "run-1", project_slug: "myapp" } as any,
    deploymentId: "dep-1",
    revisionId: "rev-1",
    imageTag: "ghcr.io/org/myapp:v2",
    config: {
      driver: "fly_io",
      strategy: "blue_green",
      port: 3000,
    } as any,
    projectSlug: "myapp",
    taskRunId: "task-1",
    secrets: {
      FLY_API_TOKEN: "test-fly-token",
    },
    ...overrides,
  };
}

function createMockFlyClient() {
  return {
    getApp: vi.fn().mockResolvedValue({ name: "myapp", organization: { slug: "personal" } }),
    listMachines: vi.fn().mockResolvedValue([]),
    createMachine: vi.fn().mockResolvedValue({
      id: "mach-1", name: "deployx-myapp", state: "created",
      region: "iad", config: { image: "ghcr.io/org/myapp:v2" },
    }),
    getMachine: vi.fn().mockResolvedValue({
      id: "mach-1", name: "deployx-myapp", state: "started",
      region: "iad", config: { image: "ghcr.io/org/myapp:v2" },
    }),
    updateMachine: vi.fn().mockResolvedValue({
      id: "mach-1", name: "deployx-myapp", state: "created",
      region: "iad", config: { image: "ghcr.io/org/myapp:v2" },
    }),
    stopMachine: vi.fn().mockResolvedValue(undefined),
    destroyMachine: vi.fn().mockResolvedValue(undefined),
    waitForMachineState: vi.fn().mockResolvedValue({ id: "mach-1", state: "started" }),
    getMachineLogs: vi.fn().mockResolvedValue([]),
  };
}

function healthyResult() {
  return { passed: true, statusCode: 200, responseTimeMs: 50, error: undefined };
}

function unhealthyResult() {
  return { passed: false, statusCode: 500, responseTimeMs: 100, error: "Internal Server Error" };
}

// ── Tests ────────────────────────────────────────────────────────

describe("FlyDeployer", () => {
  let deployer: FlyDeployer;
  let mockFly: ReturnType<typeof createMockFlyClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    deployer = new FlyDeployer();
    mockFly = createMockFlyClient();
    vi.mocked(MockFlyApiClient).mockImplementation(() => mockFly as any);
  });

  describe("deploy", () => {
    it("creates machine on first deploy", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());

      const result = await deployer.deploy(createCtx());

      expect(result.success).toBe(true);
      expect(result.publicUrl).toBe("https://myapp.fly.dev");
      expect(mockFly.createMachine).toHaveBeenCalledWith(
        "myapp",
        expect.objectContaining({ image: "ghcr.io/org/myapp:v2" }),
      );
      expect(mockFly.waitForMachineState).toHaveBeenCalledWith(
        "myapp", "mach-1", "started", expect.any(Number),
      );
    });

    it("updates existing machine instead of creating", async () => {
      mockFly.listMachines.mockResolvedValue([
        { id: "mach-old", name: "deployx-myapp", state: "started", region: "iad", config: {} },
      ]);
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());

      const result = await deployer.deploy(createCtx());

      expect(result.success).toBe(true);
      expect(mockFly.updateMachine).toHaveBeenCalledWith(
        "myapp", "mach-old", expect.objectContaining({ image: "ghcr.io/org/myapp:v2" }),
      );
      expect(mockFly.createMachine).not.toHaveBeenCalled();
    });

    it("returns error when FLY_API_TOKEN is missing", async () => {
      const ctx = createCtx({ secrets: {} });

      const result = await deployer.deploy(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain("FLY_API_TOKEN");
    });

    it("returns failure when machine fails to start", async () => {
      mockFly.waitForMachineState.mockRejectedValue(new Error("Timeout waiting for started"));
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());

      const result = await deployer.deploy(createCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain("Timeout");
    });

    it("returns failure when health check fails", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(unhealthyResult());

      const result = await deployer.deploy(createCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain("Health check failed");
      expect(result.publicUrl).toBe("https://myapp.fly.dev");
    });

    it("returns error for non-registry image tag", async () => {
      const ctx = createCtx({ imageTag: "myapp:v2" });

      const result = await deployer.deploy(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain("registry-qualified");
    });

    it("uses FLY_APP_NAME from secrets as app name", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());
      const ctx = createCtx({
        secrets: { FLY_API_TOKEN: "test-fly-token", FLY_APP_NAME: "custom-app" },
      });

      const result = await deployer.deploy(ctx);

      expect(result.success).toBe(true);
      expect(result.publicUrl).toBe("https://custom-app.fly.dev");
      expect(mockFly.listMachines).toHaveBeenCalledWith("custom-app");
    });

    it("uses app name from config.fly.app_name", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());
      const ctx = createCtx({
        config: {
          driver: "fly_io",
          strategy: "blue_green",
          port: 3000,
          fly: { app_name: "config-app" },
        } as any,
      });

      const result = await deployer.deploy(ctx);

      expect(result.success).toBe(true);
      expect(result.publicUrl).toBe("https://config-app.fly.dev");
    });

    it("falls back to projectSlug when no FLY_APP_NAME", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());

      const result = await deployer.deploy(createCtx());

      expect(result.publicUrl).toBe("https://myapp.fly.dev");
      expect(mockFly.listMachines).toHaveBeenCalledWith("myapp");
    });

    it("reports health check to API client", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());
      const ctx = createCtx();

      await deployer.deploy(ctx);

      // Allow fire-and-forget promise to resolve
      await vi.waitFor(() => {
        expect(ctx.client.recordHealthCheck).toHaveBeenCalledWith(
          "run-1",
          "dep-1",
          expect.objectContaining({ status: "pass" }),
        );
      });
    });
  });

  describe("rollback", () => {
    it("deploys with the target image tag", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());

      const result = await deployer.rollback(createCtx(), "ghcr.io/org/myapp:v1");

      expect(result.success).toBe(true);
      expect(mockFly.createMachine).toHaveBeenCalledWith(
        "myapp",
        expect.objectContaining({ image: "ghcr.io/org/myapp:v1" }),
      );
    });
  });

  describe("stop", () => {
    it("destroys all machines", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());
      // First deploy to cache the client
      await deployer.deploy(createCtx());

      mockFly.listMachines.mockResolvedValue([
        { id: "mach-1", name: "deployx-myapp-1", state: "started" },
        { id: "mach-2", name: "deployx-myapp-2", state: "started" },
      ]);

      await deployer.stop(createCtx());

      expect(mockFly.stopMachine).toHaveBeenCalledTimes(2);
      expect(mockFly.destroyMachine).toHaveBeenCalledTimes(2);
      expect(mockFly.destroyMachine).toHaveBeenCalledWith("myapp", "mach-1");
      expect(mockFly.destroyMachine).toHaveBeenCalledWith("myapp", "mach-2");
    });
  });

  describe("getLogs", () => {
    it("returns empty array when no cached client", async () => {
      const logs = await deployer.getLogs("deployx-myapp", 100);

      expect(logs).toEqual([]);
    });
  });
});
