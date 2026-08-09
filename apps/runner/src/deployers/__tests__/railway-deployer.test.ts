import { describe, it, expect, vi, beforeEach } from "vitest";
import { RailwayDeployer } from "../railway-deployer";
import type { DeployContext } from "../deployer-interface";

// Mock all dependencies
vi.mock("../clients", () => ({
  RailwayApiClient: vi.fn(),
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

const { RailwayApiClient: MockRailwayApiClient } = await import("../clients");
const { waitForHealthy } = await import("../health-checker");

// ── Helpers ───────────────────────────────────────────────────────

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
      driver: "railway",
      strategy: "blue_green",
      port: 3000,
    } as any,
    projectSlug: "myapp",
    taskRunId: "task-1",
    secrets: {
      RAILWAY_API_TOKEN: "test-token",
      RAILWAY_PROJECT_ID: "proj-123",
    },
    ...overrides,
  };
}

function createMockRailwayClient() {
  return {
    listServices: vi.fn().mockResolvedValue([]),
    createService: vi.fn().mockResolvedValue({
      id: "svc-1",
      projectId: "proj-123",
      name: "deployx-myapp",
    }),
    createDeployment: vi.fn().mockResolvedValue({
      id: "deploy-1",
      status: "BUILDING",
      serviceId: "svc-1",
    }),
    getDeployment: vi.fn().mockResolvedValue({
      id: "deploy-1",
      status: "SUCCESS",
      serviceId: "svc-1",
      staticUrl: "myapp.up.railway.app",
    }),
    cancelDeployment: vi.fn().mockResolvedValue(undefined),
    getDeploymentLogs: vi.fn().mockResolvedValue([]),
  };
}

function healthyResult() {
  return { passed: true, statusCode: 200, responseTimeMs: 50, error: undefined };
}

function unhealthyResult() {
  return { passed: false, statusCode: 500, responseTimeMs: 100, error: "Service unavailable" };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("RailwayDeployer", () => {
  let deployer: RailwayDeployer;
  let mockRailway: ReturnType<typeof createMockRailwayClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    deployer = new RailwayDeployer();
    mockRailway = createMockRailwayClient();
    vi.mocked(MockRailwayApiClient).mockImplementation(() => mockRailway as any);
  });

  describe("deploy", () => {
    it("successful first deploy — creates service, polls, health passes", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());

      const result = await deployer.deploy(createCtx());

      expect(result.success).toBe(true);
      expect(result.publicUrl).toBe("https://myapp.up.railway.app");
      expect(mockRailway.createService).toHaveBeenCalledWith("proj-123", "deployx-myapp");
      expect(mockRailway.createDeployment).toHaveBeenCalledWith(
        "svc-1",
        "ghcr.io/org/myapp:v2",
        undefined,
      );
    });

    it("finds existing service and skips creation", async () => {
      mockRailway.listServices.mockResolvedValue([
        { id: "svc-1", name: "deployx-myapp", projectId: "proj-123" },
      ]);
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());

      const result = await deployer.deploy(createCtx());

      expect(result.success).toBe(true);
      expect(mockRailway.createService).not.toHaveBeenCalled();
    });

    it("returns error when RAILWAY_API_TOKEN is missing", async () => {
      const ctx = createCtx({ secrets: { RAILWAY_PROJECT_ID: "proj-123" } });

      const result = await deployer.deploy(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain("RAILWAY_API_TOKEN");
    });

    it("returns error when RAILWAY_PROJECT_ID is missing", async () => {
      const ctx = createCtx({ secrets: { RAILWAY_API_TOKEN: "test-token" } });

      const result = await deployer.deploy(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain("RAILWAY_PROJECT_ID");
    });

    it("returns failure when deployment status becomes FAILED", async () => {
      mockRailway.getDeployment.mockResolvedValue({
        id: "deploy-1",
        status: "FAILED",
        serviceId: "svc-1",
      });
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());

      const result = await deployer.deploy(createCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain("FAILED");
    });

    it("returns failure when health check fails", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(unhealthyResult());

      const result = await deployer.deploy(createCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain("Health check failed");
    });

    it("returns error for non-registry-qualified image tag", async () => {
      const ctx = createCtx({ imageTag: "myapp:v2" });

      const result = await deployer.deploy(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain("registry-qualified");
    });

    it("pushes log messages via logStreamer", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());

      const ctx = createCtx();
      await deployer.deploy(ctx);

      const messages = vi.mocked(ctx.logStreamer.push).mock.calls.map(
        (c) => (c[0] as any).message,
      );
      expect(messages.some((m: string) => m.includes("[railway] Starting deployment"))).toBe(true);
      expect(messages.some((m: string) => m.includes("[railway] Using service"))).toBe(true);
      expect(messages.some((m: string) => m.includes("[railway] Deployment created"))).toBe(true);
      expect(messages.some((m: string) => m.includes("[railway] Deployment live"))).toBe(true);
    });

    it("reports health check result via client.recordHealthCheck", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());

      const ctx = createCtx();
      await deployer.deploy(ctx);

      // Allow fire-and-forget promise to resolve
      await vi.waitFor(() => {
        expect(vi.mocked(ctx.client.recordHealthCheck)).toHaveBeenCalledWith(
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

      const ctx = createCtx();
      const result = await deployer.rollback(ctx, "ghcr.io/org/myapp:v1");

      expect(result.success).toBe(true);
      expect(mockRailway.createDeployment).toHaveBeenCalledWith(
        "svc-1",
        "ghcr.io/org/myapp:v1",
        undefined,
      );
    });
  });

  describe("stop", () => {
    it("cancels the cached deployment", async () => {
      vi.mocked(waitForHealthy).mockResolvedValue(healthyResult());
      const ctx = createCtx();

      // Deploy first to populate cached state
      await deployer.deploy(ctx);
      vi.clearAllMocks();

      await deployer.stop(ctx);

      expect(mockRailway.cancelDeployment).toHaveBeenCalledWith("deploy-1");
    });
  });

  describe("getLogs", () => {
    it("returns empty array when no cached client exists", async () => {
      const logs = await deployer.getLogs("any-container");
      expect(logs).toEqual([]);
    });
  });
});
