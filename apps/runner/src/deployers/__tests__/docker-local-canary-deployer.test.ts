import { describe, it, expect, vi, beforeEach } from "vitest";
import { DockerLocalCanaryDeployer } from "../docker-local-canary-deployer";
import type { DeployContext } from "../deployer-interface";

// Mock all dependencies
vi.mock("../container-manager", () => ({
  ensureNetwork: vi.fn(),
  runContainer: vi.fn(),
  stopContainer: vi.fn(),
  removeContainerIfExists: vi.fn(),
  isContainerRunning: vi.fn(),
  getContainerLogs: vi.fn().mockResolvedValue(["log line 1"]),
  listContainersByLabel: vi.fn().mockResolvedValue([]),
  inspectContainer: vi.fn(),
}));

vi.mock("../health-checker", () => ({
  waitForHealthyViaDocker: vi.fn(),
  checkHealthViaDocker: vi.fn(),
}));

vi.mock("../port-allocator", () => ({
  allocatePort: vi.fn().mockReturnValue({ proxyPort: 10001 }),
}));

vi.mock("../nginx-config", () => ({
  generateWeightedNginxConfig: vi.fn().mockReturnValue("mock-weighted-config"),
  calculateCanaryWeights: vi.fn().mockReturnValue({ stableWeight: 9, canaryWeight: 1 }),
  writeNginxConfig: vi.fn(),
  reloadNginx: vi.fn(),
}));

// Fast-forward all sleeps
vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: () => void) => {
  fn();
  return 0 as unknown as ReturnType<typeof setTimeout>;
});

const { isContainerRunning } = await import("../container-manager");
const { waitForHealthyViaDocker, checkHealthViaDocker } = await import("../health-checker");
const { generateWeightedNginxConfig, calculateCanaryWeights } = await import("../nginx-config");
const { runContainer, stopContainer, removeContainerIfExists } = await import("../container-manager");

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
    imageTag: "myapp:v2",
    config: {
      driver: "docker_local",
      strategy: "canary",
      port: 3000,
    } as any,
    projectSlug: "myapp",
    taskRunId: "task-1",
    secrets: {},
    ...overrides,
  };
}

function healthyResult() {
  return { passed: true, statusCode: 200, responseTimeMs: 50, error: undefined };
}

function unhealthyResult() {
  return { passed: false, statusCode: 500, responseTimeMs: 100, error: "Internal Server Error" };
}

describe("DockerLocalCanaryDeployer", () => {
  let deployer: DockerLocalCanaryDeployer;

  beforeEach(() => {
    vi.clearAllMocks();
    deployer = new DockerLocalCanaryDeployer();
  });

  describe("deploy — first deploy (no stable exists)", () => {
    it("creates single stable container when no stable is running", async () => {
      vi.mocked(isContainerRunning).mockResolvedValue(false);
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(healthyResult());

      const result = await deployer.deploy(createCtx());

      expect(result.success).toBe(true);
      expect(result.publicUrl).toContain("localhost");
      expect(vi.mocked(runContainer)).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "deployx-myapp-stable",
          image: "myapp:v2",
        }),
      );
    });

    it("returns failure when first deploy health check fails", async () => {
      vi.mocked(isContainerRunning).mockResolvedValue(false);
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(unhealthyResult());

      const result = await deployer.deploy(createCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain("Health check failed");
    });

    it("sets correct labels including strategy and canaryRole", async () => {
      vi.mocked(isContainerRunning).mockResolvedValue(false);
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(healthyResult());

      await deployer.deploy(createCtx());

      expect(vi.mocked(runContainer)).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.objectContaining({
            "deployx.strategy": "canary",
            "deployx.canaryRole": "stable",
            "deployx.role": "app",
          }),
        }),
      );
    });
  });

  describe("deploy — canary promotion", () => {
    beforeEach(() => {
      // Stable exists, canary doesn't
      vi.mocked(isContainerRunning).mockImplementation(async (name: string) => {
        if (name === "deployx-myapp-stable") return true;
        return false; // canary, proxy
      });
    });

    it("starts canary container with correct labels", async () => {
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(healthyResult());
      vi.mocked(checkHealthViaDocker).mockResolvedValue(healthyResult());

      await deployer.deploy(createCtx());

      const calls = vi.mocked(runContainer).mock.calls;
      // First call: canary container, second call: proxy (if needed), third: new stable
      const canaryCall = calls.find(
        (c) => (c[0] as any).name === "deployx-myapp-canary",
      );
      expect(canaryCall).toBeDefined();
      expect((canaryCall![0] as any).labels["deployx.canaryRole"]).toBe("canary");
    });

    it("stops canary and returns failure when initial health check fails", async () => {
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(unhealthyResult());

      const result = await deployer.deploy(createCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain("Canary health check failed");
      expect(vi.mocked(stopContainer)).toHaveBeenCalledWith(
        "deployx-myapp-canary",
        5,
      );
    });

    it("progresses through all default stages", async () => {
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(healthyResult());
      vi.mocked(checkHealthViaDocker).mockResolvedValue(healthyResult());

      const ctx = createCtx();
      await deployer.deploy(ctx);

      const client = ctx.client as any;
      const promotionCalls = client.recordHealingEvent.mock.calls.filter(
        (c: any[]) => c[2]?.event_type === "canary_promotion",
      );

      expect(promotionCalls).toHaveLength(4);
      expect(promotionCalls[0][2].details.percentage).toBe(10);
      expect(promotionCalls[1][2].details.percentage).toBe(25);
      expect(promotionCalls[2][2].details.percentage).toBe(50);
      expect(promotionCalls[3][2].details.percentage).toBe(100);
    });

    it("updates nginx weights at each stage", async () => {
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(healthyResult());
      vi.mocked(checkHealthViaDocker).mockResolvedValue(healthyResult());

      await deployer.deploy(createCtx());

      // generateWeightedNginxConfig should be called for each stage + final
      expect(vi.mocked(generateWeightedNginxConfig).mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it("auto-rollbacks when canary is unhealthy during observation", async () => {
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(healthyResult());
      // First observation check passes, second fails
      vi.mocked(checkHealthViaDocker)
        .mockResolvedValueOnce(healthyResult())
        .mockResolvedValueOnce(unhealthyResult());

      const ctx = createCtx();
      const result = await deployer.deploy(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Canary unhealthy at");

      // Should have recorded canary_rollback event
      const client = ctx.client as any;
      const rollbackCalls = client.recordHealingEvent.mock.calls.filter(
        (c: any[]) => c[2]?.event_type === "canary_rollback",
      );
      expect(rollbackCalls).toHaveLength(1);
    });

    it("records canary_rollback healing event with failure details", async () => {
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(healthyResult());
      vi.mocked(checkHealthViaDocker).mockResolvedValue(unhealthyResult());

      const ctx = createCtx();
      await deployer.deploy(ctx);

      const client = ctx.client as any;
      const rollbackCall = client.recordHealingEvent.mock.calls.find(
        (c: any[]) => c[2]?.event_type === "canary_rollback",
      );
      expect(rollbackCall).toBeDefined();
      expect(rollbackCall![2].details.failed_at_percentage).toBe(10);
    });

    it("at 100% stops old stable and creates new stable with canary image", async () => {
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(healthyResult());
      vi.mocked(checkHealthViaDocker).mockResolvedValue(healthyResult());

      await deployer.deploy(createCtx());

      // Old stable should be stopped
      expect(vi.mocked(stopContainer)).toHaveBeenCalledWith(
        "deployx-myapp-stable",
        10,
      );

      // New stable should be started with the canary image
      const stableCalls = vi.mocked(runContainer).mock.calls.filter(
        (c) => (c[0] as any).name === "deployx-myapp-stable",
      );
      // Last stable creation should use the canary image
      const lastStable = stableCalls[stableCalls.length - 1];
      expect((lastStable[0] as any).image).toBe("myapp:v2");
      expect((lastStable[0] as any).labels["deployx.canaryRole"]).toBe("stable");
    });

    it("uses custom stages from config", async () => {
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(healthyResult());
      vi.mocked(checkHealthViaDocker).mockResolvedValue(healthyResult());

      const ctx = createCtx({
        config: {
          driver: "docker_local",
          strategy: "canary",
          port: 3000,
          canary: { stages: [50, 100], observation_seconds: 5 },
        } as any,
      });

      await deployer.deploy(ctx);

      const client = ctx.client as any;
      const promotionCalls = client.recordHealingEvent.mock.calls.filter(
        (c: any[]) => c[2]?.event_type === "canary_promotion",
      );
      expect(promotionCalls).toHaveLength(2);
      expect(promotionCalls[0][2].details.percentage).toBe(50);
      expect(promotionCalls[1][2].details.percentage).toBe(100);
    });

    it("restores 100% stable nginx on rollback", async () => {
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(healthyResult());
      vi.mocked(checkHealthViaDocker).mockResolvedValue(unhealthyResult());

      await deployer.deploy(createCtx());

      // After rollback, nginx should be reconfigured to stable only
      const lastWeightedCall = vi.mocked(generateWeightedNginxConfig).mock.calls.slice(-1)[0];
      expect((lastWeightedCall[0] as any).upstreams).toHaveLength(1);
      expect((lastWeightedCall[0] as any).upstreams[0].name).toBe("deployx-myapp-stable");
    });
  });

  describe("rollback", () => {
    it("deploys target image as new stable", async () => {
      vi.mocked(isContainerRunning).mockResolvedValue(false);
      vi.mocked(waitForHealthyViaDocker).mockResolvedValue(healthyResult());

      const ctx = createCtx();
      const result = await deployer.rollback(ctx, "myapp:v1");

      expect(result.success).toBe(true);
      expect(vi.mocked(runContainer)).toHaveBeenCalledWith(
        expect.objectContaining({ image: "myapp:v1" }),
      );
    });
  });

  describe("stop", () => {
    it("removes stable, canary, and proxy containers", async () => {
      await deployer.stop(createCtx());

      expect(vi.mocked(removeContainerIfExists)).toHaveBeenCalledWith("deployx-myapp-stable");
      expect(vi.mocked(removeContainerIfExists)).toHaveBeenCalledWith("deployx-myapp-canary");
      expect(vi.mocked(removeContainerIfExists)).toHaveBeenCalledWith("deployx-proxy-myapp");
    });
  });

  describe("getStatus", () => {
    it("returns active when stable is running", async () => {
      vi.mocked(isContainerRunning).mockResolvedValue(true);
      const status = await deployer.getStatus("myapp");
      expect(status).toBe("active");
    });

    it("returns stopped when stable is not running", async () => {
      vi.mocked(isContainerRunning).mockResolvedValue(false);
      const status = await deployer.getStatus("myapp");
      expect(status).toBe("stopped");
    });
  });

  describe("getHealth", () => {
    it("returns healthy when stable passes health check", async () => {
      vi.mocked(isContainerRunning).mockResolvedValue(true);
      vi.mocked(checkHealthViaDocker).mockResolvedValue(healthyResult());

      const health = await deployer.getHealth("myapp", "/health", 3000);
      expect(health).toBe("healthy");
    });

    it("returns unknown when stable is not running", async () => {
      vi.mocked(isContainerRunning).mockResolvedValue(false);

      const health = await deployer.getHealth("myapp", "/health", 3000);
      expect(health).toBe("unknown");
    });
  });

  describe("getLogs", () => {
    it("delegates to container-manager", async () => {
      const logs = await deployer.getLogs("deployx-myapp-stable", 50);
      expect(logs).toEqual(["log line 1"]);
    });
  });
});
