import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HealthMonitor } from "../health-monitor";

// Mock container-manager
vi.mock("../container-manager", () => ({
  listContainersByLabel: vi.fn(),
  inspectContainer: vi.fn(),
  isContainerRunning: vi.fn(),
  restartContainer: vi.fn(),
  runContainer: vi.fn(),
  removeContainerIfExists: vi.fn(),
  stopContainer: vi.fn(),
}));

// Mock health-checker
vi.mock("../health-checker", () => ({
  checkHealthViaDocker: vi.fn(),
  waitForHealthyViaDocker: vi.fn(),
}));

// Mock remediation-engine
vi.mock("../remediation-engine", () => ({
  createRemediationState: vi.fn().mockReturnValue({
    restartCount: 0,
    lastRestartAt: 0,
    isRemediating: false,
  }),
  remediate: vi.fn().mockResolvedValue({
    action: "none",
    success: true,
    newState: { restartCount: 0, lastRestartAt: 0, isRemediating: false },
  }),
}));

// Mock port-allocator
vi.mock("../port-allocator", () => ({
  allocatePort: vi.fn().mockReturnValue({ proxyPort: 10000 }),
}));

// Mock nginx-config
vi.mock("../nginx-config", () => ({
  generateNginxConfig: vi.fn().mockReturnValue("mock-config"),
  writeNginxConfig: vi.fn(),
  reloadNginx: vi.fn(),
}));

function createMockClient() {
  return {
    recordHealthCheck: vi.fn().mockResolvedValue(undefined),
    recordHealingEvent: vi.fn().mockResolvedValue(undefined),
    updateDeployment: vi.fn().mockResolvedValue(undefined),
  } as unknown as import("../../api-client").RunnerApiClient;
}

describe("HealthMonitor", () => {
  let containerManager: typeof import("../container-manager");
  let healthChecker: typeof import("../health-checker");
  let remediationEngine: typeof import("../remediation-engine");

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    containerManager = await import("../container-manager");
    healthChecker = await import("../health-checker");
    remediationEngine = await import("../remediation-engine");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts and creates interval", () => {
    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });

    monitor.start();
    monitor.stop();
  });

  it("does not start twice", () => {
    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });

    monitor.start();
    monitor.start(); // Should not create second interval
    monitor.stop();
  });

  it("stops when AbortSignal fires", () => {
    const client = createMockClient();
    const controller = new AbortController();
    const monitor = new HealthMonitor({
      client,
      intervalMs: 1000,
      signal: controller.signal,
    });

    monitor.start();
    controller.abort();

    // After abort, the next tick should stop
    vi.advanceTimersByTime(1000);
    // Monitor should be stopped now — no errors expected
  });

  it("discovers containers with deployx.role=app label", async () => {
    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      {
        id: "abc123",
        name: "deployx-myapp-blue",
        status: "Up 5 minutes",
        image: "myapp:v1",
      },
    ]);

    vi.mocked(containerManager.inspectContainer).mockResolvedValue({
      id: "abc123",
      name: "deployx-myapp-blue",
      state: "running",
      image: "myapp:v1",
      labels: {
        "deployx.project": "myapp",
        "deployx.role": "app",
        "deployx.color": "blue",
        "deployx.deployment": "dep-1",
        "deployx.runId": "run-1",
        "deployx.healthPath": "/health",
        "deployx.appPort": "3000",
      },
    });

    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(true);
    vi.mocked(healthChecker.checkHealthViaDocker).mockResolvedValue({
      passed: true,
      statusCode: 200,
      responseTimeMs: 50,
    });

    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    // Advance timer to trigger first tick
    await vi.advanceTimersByTimeAsync(1000);

    expect(containerManager.listContainersByLabel).toHaveBeenCalledWith(
      "deployx.role=app",
    );
    expect(containerManager.inspectContainer).toHaveBeenCalledWith(
      "deployx-myapp-blue",
    );

    monitor.stop();
  });

  it("skips containers without required labels", async () => {
    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      {
        id: "abc123",
        name: "some-container",
        status: "Up 5 minutes",
        image: "myapp:v1",
      },
    ]);

    vi.mocked(containerManager.inspectContainer).mockResolvedValue({
      id: "abc123",
      name: "some-container",
      state: "running",
      image: "myapp:v1",
      labels: {
        "deployx.project": "myapp",
        // Missing deployx.deployment and deployx.runId and deployx.color
      },
    });

    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1000);

    // Should not perform health checks since container was skipped
    expect(healthChecker.checkHealthViaDocker).not.toHaveBeenCalled();

    monitor.stop();
  });

  it("skips containers that are not running (status not 'Up')", async () => {
    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      {
        id: "abc123",
        name: "deployx-myapp-blue",
        status: "Exited (1) 5 minutes ago",
        image: "myapp:v1",
      },
    ]);

    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1000);

    // Should not inspect exited containers
    expect(containerManager.inspectContainer).not.toHaveBeenCalled();

    monitor.stop();
  });

  it("performs dual health check (container + HTTP)", async () => {
    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      {
        id: "abc123",
        name: "deployx-myapp-blue",
        status: "Up 5 minutes",
        image: "myapp:v1",
      },
    ]);

    vi.mocked(containerManager.inspectContainer).mockResolvedValue({
      id: "abc123",
      name: "deployx-myapp-blue",
      state: "running",
      image: "myapp:v1",
      labels: {
        "deployx.project": "myapp",
        "deployx.role": "app",
        "deployx.color": "blue",
        "deployx.deployment": "dep-1",
        "deployx.runId": "run-1",
        "deployx.healthPath": "/healthz",
        "deployx.appPort": "8080",
      },
    });

    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(true);
    vi.mocked(healthChecker.checkHealthViaDocker).mockResolvedValue({
      passed: true,
      statusCode: 200,
      responseTimeMs: 25,
    });

    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(containerManager.isContainerRunning).toHaveBeenCalledWith(
      "deployx-myapp-blue",
    );
    expect(healthChecker.checkHealthViaDocker).toHaveBeenCalledWith(
      "deployx-myapp-blue",
      8080,
      "/healthz",
      5000,
    );

    monitor.stop();
  });

  it("reports health check results to API", async () => {
    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      {
        id: "abc123",
        name: "deployx-myapp-blue",
        status: "Up 5 minutes",
        image: "myapp:v1",
      },
    ]);

    vi.mocked(containerManager.inspectContainer).mockResolvedValue({
      id: "abc123",
      name: "deployx-myapp-blue",
      state: "running",
      image: "myapp:v1",
      labels: {
        "deployx.project": "myapp",
        "deployx.role": "app",
        "deployx.color": "blue",
        "deployx.deployment": "dep-1",
        "deployx.runId": "run-1",
        "deployx.healthPath": "/health",
        "deployx.appPort": "3000",
      },
    });

    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(true);
    vi.mocked(healthChecker.checkHealthViaDocker).mockResolvedValue({
      passed: true,
      statusCode: 200,
      responseTimeMs: 42,
    });

    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1000);

    // Allow fire-and-forget promise to resolve
    await vi.advanceTimersByTimeAsync(0);

    expect(client.recordHealthCheck).toHaveBeenCalledWith(
      "run-1",
      "dep-1",
      expect.objectContaining({
        status: "pass",
        response_time_ms: 42,
        status_code: 200,
      }),
    );

    monitor.stop();
  });

  it("calls remediate with health status", async () => {
    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      {
        id: "abc123",
        name: "deployx-myapp-blue",
        status: "Up 5 minutes",
        image: "myapp:v1",
      },
    ]);

    vi.mocked(containerManager.inspectContainer).mockResolvedValue({
      id: "abc123",
      name: "deployx-myapp-blue",
      state: "running",
      image: "myapp:v1",
      labels: {
        "deployx.project": "myapp",
        "deployx.role": "app",
        "deployx.color": "blue",
        "deployx.deployment": "dep-1",
        "deployx.runId": "run-1",
        "deployx.healthPath": "/health",
        "deployx.appPort": "3000",
      },
    });

    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(true);
    vi.mocked(healthChecker.checkHealthViaDocker).mockResolvedValue({
      passed: true,
      statusCode: 200,
      responseTimeMs: 50,
    });

    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(remediationEngine.remediate).toHaveBeenCalled();

    monitor.stop();
  });

  it("skips HTTP check when container is not running", async () => {
    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      {
        id: "abc123",
        name: "deployx-myapp-blue",
        status: "Up 1 second",
        image: "myapp:v1",
      },
    ]);

    vi.mocked(containerManager.inspectContainer).mockResolvedValue({
      id: "abc123",
      name: "deployx-myapp-blue",
      state: "running",
      image: "myapp:v1",
      labels: {
        "deployx.project": "myapp",
        "deployx.role": "app",
        "deployx.color": "blue",
        "deployx.deployment": "dep-1",
        "deployx.runId": "run-1",
        "deployx.healthPath": "/health",
        "deployx.appPort": "3000",
      },
    });

    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(false);

    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1000);

    // HTTP check should be skipped when container is not running
    expect(healthChecker.checkHealthViaDocker).not.toHaveBeenCalled();

    monitor.stop();
  });

  it("preserves sliding window state across ticks for same deployment", async () => {
    const containerData = {
      id: "abc123",
      name: "deployx-myapp-blue",
      status: "Up 5 minutes",
      image: "myapp:v1",
    };

    const inspectionData = {
      id: "abc123",
      name: "deployx-myapp-blue",
      state: "running",
      image: "myapp:v1",
      labels: {
        "deployx.project": "myapp",
        "deployx.role": "app",
        "deployx.color": "blue",
        "deployx.deployment": "dep-1",
        "deployx.runId": "run-1",
        "deployx.healthPath": "/health",
        "deployx.appPort": "3000",
      },
    };

    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      containerData,
    ]);
    vi.mocked(containerManager.inspectContainer).mockResolvedValue(
      inspectionData,
    );
    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(true);
    vi.mocked(healthChecker.checkHealthViaDocker).mockResolvedValue({
      passed: true,
      statusCode: 200,
      responseTimeMs: 50,
    });

    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    // First tick
    await vi.advanceTimersByTimeAsync(1000);
    // Second tick
    await vi.advanceTimersByTimeAsync(1000);

    // remediate should have been called twice with the same deployment ref
    expect(remediationEngine.remediate).toHaveBeenCalledTimes(2);

    monitor.stop();
  });

  it("drops vanished deployments during reconciliation", async () => {
    const containerData = {
      id: "abc123",
      name: "deployx-myapp-blue",
      status: "Up 5 minutes",
      image: "myapp:v1",
    };

    const inspectionData = {
      id: "abc123",
      name: "deployx-myapp-blue",
      state: "running",
      image: "myapp:v1",
      labels: {
        "deployx.project": "myapp",
        "deployx.role": "app",
        "deployx.color": "blue",
        "deployx.deployment": "dep-1",
        "deployx.runId": "run-1",
        "deployx.healthPath": "/health",
        "deployx.appPort": "3000",
      },
    };

    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      containerData,
    ]);
    vi.mocked(containerManager.inspectContainer).mockResolvedValue(
      inspectionData,
    );
    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(true);
    vi.mocked(healthChecker.checkHealthViaDocker).mockResolvedValue({
      passed: true,
      statusCode: 200,
      responseTimeMs: 50,
    });

    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    // First tick — discovers deployment
    await vi.advanceTimersByTimeAsync(1000);
    expect(remediationEngine.remediate).toHaveBeenCalledTimes(1);

    // Container vanishes
    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([]);

    // Second tick — should not call remediate (no deployments)
    vi.clearAllMocks();
    await vi.advanceTimersByTimeAsync(1000);
    expect(remediationEngine.remediate).not.toHaveBeenCalled();

    monitor.stop();
  });

  it("discovers canary strategy containers without color label", async () => {
    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      {
        id: "canary1",
        name: "deployx-myapp-stable",
        status: "Up 5 minutes",
        image: "myapp:v1",
      },
    ]);

    vi.mocked(containerManager.inspectContainer).mockResolvedValue({
      id: "canary1",
      name: "deployx-myapp-stable",
      state: "running",
      image: "myapp:v1",
      labels: {
        "deployx.project": "myapp",
        "deployx.role": "app",
        "deployx.strategy": "canary",
        "deployx.canaryRole": "stable",
        "deployx.deployment": "dep-2",
        "deployx.runId": "run-2",
        "deployx.healthPath": "/health",
        "deployx.appPort": "3000",
      },
    });

    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(true);
    vi.mocked(healthChecker.checkHealthViaDocker).mockResolvedValue({
      passed: true,
      statusCode: 200,
      responseTimeMs: 30,
    });

    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1000);

    // Should perform health check on canary container
    expect(healthChecker.checkHealthViaDocker).toHaveBeenCalledWith(
      "deployx-myapp-stable",
      3000,
      "/health",
      5000,
    );
    expect(remediationEngine.remediate).toHaveBeenCalled();

    monitor.stop();
  });

  it("discovers rolling strategy containers with ordinal labels", async () => {
    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      {
        id: "roll1",
        name: "deployx-myapp-inst-0",
        status: "Up 5 minutes",
        image: "myapp:v2",
      },
    ]);

    vi.mocked(containerManager.inspectContainer).mockResolvedValue({
      id: "roll1",
      name: "deployx-myapp-inst-0",
      state: "running",
      image: "myapp:v2",
      labels: {
        "deployx.project": "myapp",
        "deployx.role": "app",
        "deployx.strategy": "rolling",
        "deployx.ordinal": "0",
        "deployx.deployment": "dep-3",
        "deployx.runId": "run-3",
        "deployx.healthPath": "/health",
        "deployx.appPort": "3000",
      },
    });

    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(true);
    vi.mocked(healthChecker.checkHealthViaDocker).mockResolvedValue({
      passed: true,
      statusCode: 200,
      responseTimeMs: 25,
    });

    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(healthChecker.checkHealthViaDocker).toHaveBeenCalled();
    expect(remediationEngine.remediate).toHaveBeenCalled();

    monitor.stop();
  });

  it("skips blue_green containers without color label", async () => {
    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      {
        id: "abc123",
        name: "deployx-myapp-unknown",
        status: "Up 5 minutes",
        image: "myapp:v1",
      },
    ]);

    vi.mocked(containerManager.inspectContainer).mockResolvedValue({
      id: "abc123",
      name: "deployx-myapp-unknown",
      state: "running",
      image: "myapp:v1",
      labels: {
        "deployx.project": "myapp",
        "deployx.role": "app",
        // No color label and no strategy label (defaults to blue_green)
        "deployx.deployment": "dep-1",
        "deployx.runId": "run-1",
        "deployx.healthPath": "/health",
        "deployx.appPort": "3000",
      },
    });

    const client = createMockClient();
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1000);

    // Should skip this container since blue_green requires color
    expect(healthChecker.checkHealthViaDocker).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("blue_green requires color label"),
    );

    consoleSpy.mockRestore();
    monitor.stop();
  });

  it("defaults strategy to blue_green when deployx.strategy label is missing", async () => {
    vi.mocked(containerManager.listContainersByLabel).mockResolvedValue([
      {
        id: "abc123",
        name: "deployx-myapp-blue",
        status: "Up 5 minutes",
        image: "myapp:v1",
      },
    ]);

    vi.mocked(containerManager.inspectContainer).mockResolvedValue({
      id: "abc123",
      name: "deployx-myapp-blue",
      state: "running",
      image: "myapp:v1",
      labels: {
        "deployx.project": "myapp",
        "deployx.role": "app",
        "deployx.color": "blue",
        // No deployx.strategy label — should default to blue_green
        "deployx.deployment": "dep-1",
        "deployx.runId": "run-1",
        "deployx.healthPath": "/health",
        "deployx.appPort": "3000",
      },
    });

    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(true);
    vi.mocked(healthChecker.checkHealthViaDocker).mockResolvedValue({
      passed: true,
      statusCode: 200,
      responseTimeMs: 30,
    });

    const client = createMockClient();
    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1000);

    // Should still work — blue_green with color=blue
    expect(healthChecker.checkHealthViaDocker).toHaveBeenCalled();

    monitor.stop();
  });

  it("handles tick errors gracefully", async () => {
    vi.mocked(containerManager.listContainersByLabel).mockRejectedValue(
      new Error("docker daemon unavailable"),
    );

    const client = createMockClient();
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const monitor = new HealthMonitor({ client, intervalMs: 1000 });
    monitor.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Tick failed"),
    );

    consoleSpy.mockRestore();
    monitor.stop();
  });
});
