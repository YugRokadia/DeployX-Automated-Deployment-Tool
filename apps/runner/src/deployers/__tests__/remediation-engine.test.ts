import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createRemediationState,
  calculateBackoffMs,
  isBackoffElapsed,
  remediate,
} from "../remediation-engine";
import type { DeploymentRef, RemediationState } from "../remediation-engine";

// Mock container-manager
vi.mock("../container-manager", () => ({
  restartContainer: vi.fn(),
  isContainerRunning: vi.fn(),
  runContainer: vi.fn(),
  removeContainerIfExists: vi.fn(),
  stopContainer: vi.fn(),
}));

// Mock health-checker
vi.mock("../health-checker", () => ({
  waitForHealthyViaDocker: vi.fn(),
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
    recordHealingEvent: vi.fn().mockResolvedValue(undefined),
    updateDeployment: vi.fn().mockResolvedValue(undefined),
    recordHealthCheck: vi.fn().mockResolvedValue(undefined),
  } as unknown as import("../../api-client").RunnerApiClient;
}

function createRef(overrides?: Partial<DeploymentRef>): DeploymentRef {
  return {
    deploymentId: "dep-1",
    runId: "run-1",
    projectSlug: "myapp",
    containerName: "deployx-myapp-blue",
    healthPath: "/health",
    appPort: 3000,
    currentImageTag: "myapp:v2",
    previousImageTag: "myapp:v1",
    currentColor: "blue",
    ...overrides,
  };
}

describe("createRemediationState", () => {
  it("returns zeroed state", () => {
    const state = createRemediationState();

    expect(state.restartCount).toBe(0);
    expect(state.lastRestartAt).toBe(0);
    expect(state.isRemediating).toBe(false);
  });
});

describe("calculateBackoffMs", () => {
  it("returns 5000ms for attempt 1", () => {
    expect(calculateBackoffMs(1)).toBe(5000);
  });

  it("returns 10000ms for attempt 2", () => {
    expect(calculateBackoffMs(2)).toBe(10000);
  });

  it("returns 20000ms for attempt 3", () => {
    expect(calculateBackoffMs(3)).toBe(20000);
  });
});

describe("isBackoffElapsed", () => {
  it("returns true when no previous restart", () => {
    const state = createRemediationState();

    expect(isBackoffElapsed(state)).toBe(true);
  });

  it("returns false when within backoff period", () => {
    const state: RemediationState = {
      restartCount: 1,
      lastRestartAt: Date.now() - 1000, // 1s ago, backoff is 5s
      isRemediating: false,
    };

    expect(isBackoffElapsed(state)).toBe(false);
  });

  it("returns true when backoff has elapsed", () => {
    const state: RemediationState = {
      restartCount: 1,
      lastRestartAt: Date.now() - 10000, // 10s ago, backoff is 5s
      isRemediating: false,
    };

    expect(isBackoffElapsed(state)).toBe(true);
  });

  it("uses exponential backoff for higher attempt counts", () => {
    // Attempt 2 → 10s backoff
    const recentState: RemediationState = {
      restartCount: 2,
      lastRestartAt: Date.now() - 7000, // 7s ago, backoff is 10s
      isRemediating: false,
    };
    expect(isBackoffElapsed(recentState)).toBe(false);

    const oldState: RemediationState = {
      restartCount: 2,
      lastRestartAt: Date.now() - 15000, // 15s ago, backoff is 10s
      isRemediating: false,
    };
    expect(isBackoffElapsed(oldState)).toBe(true);
  });
});

describe("remediate", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let containerManager: typeof import("../container-manager");

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockClient = createMockClient();
    containerManager = await import("../container-manager");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns no action when healthy", async () => {
    const result = await remediate(
      createRef(),
      "healthy",
      createRemediationState(),
      mockClient,
    );

    expect(result.action).toBe("none");
    expect(result.success).toBe(true);
  });

  it("resets restart counter when healthy and had previous restarts", async () => {
    const state: RemediationState = {
      restartCount: 2,
      lastRestartAt: Date.now() - 60000,
      isRemediating: false,
    };

    const result = await remediate(createRef(), "healthy", state, mockClient);

    expect(result.action).toBe("none");
    expect(result.newState.restartCount).toBe(0);
    expect(result.newState.lastRestartAt).toBe(0);
  });

  it("returns no action when degraded", async () => {
    const result = await remediate(
      createRef(),
      "degraded",
      createRemediationState(),
      mockClient,
    );

    expect(result.action).toBe("none");
    expect(result.success).toBe(true);
  });

  it("skips when isRemediating is true", async () => {
    const state: RemediationState = {
      restartCount: 0,
      lastRestartAt: 0,
      isRemediating: true,
    };

    const result = await remediate(createRef(), "unhealthy", state, mockClient);

    expect(result.action).toBe("none");
  });

  it("skips when backoff has not elapsed", async () => {
    const state: RemediationState = {
      restartCount: 1,
      lastRestartAt: Date.now() - 1000, // 1s ago, backoff is 5s
      isRemediating: false,
    };

    const result = await remediate(createRef(), "unhealthy", state, mockClient);

    expect(result.action).toBe("none");
  });

  it("attempts restart when unhealthy and restartCount < 3", async () => {
    vi.mocked(containerManager.restartContainer).mockResolvedValue(undefined);
    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(true);

    const promise = remediate(
      createRef(),
      "unhealthy",
      createRemediationState(),
      mockClient,
    );

    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result.action).toBe("restart");
    expect(result.success).toBe(true);
    expect(result.newState.restartCount).toBe(1);
    expect(containerManager.restartContainer).toHaveBeenCalledWith(
      "deployx-myapp-blue",
      10,
    );
  });

  it("records restart_started and restart_succeeded events", async () => {
    vi.mocked(containerManager.restartContainer).mockResolvedValue(undefined);
    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(true);

    const promise = remediate(
      createRef(),
      "unhealthy",
      createRemediationState(),
      mockClient,
    );

    await vi.advanceTimersByTimeAsync(3000);
    await promise;

    expect(mockClient.recordHealingEvent).toHaveBeenCalledTimes(2);
    expect(mockClient.recordHealingEvent).toHaveBeenCalledWith(
      "run-1",
      "dep-1",
      expect.objectContaining({ event_type: "restart_started" }),
    );
    expect(mockClient.recordHealingEvent).toHaveBeenCalledWith(
      "run-1",
      "dep-1",
      expect.objectContaining({ event_type: "restart_succeeded" }),
    );
  });

  it("records restart_failed when container does not come back", async () => {
    vi.mocked(containerManager.restartContainer).mockResolvedValue(undefined);
    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(false);

    const promise = remediate(
      createRef(),
      "unhealthy",
      createRemediationState(),
      mockClient,
    );

    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result.action).toBe("restart");
    expect(result.success).toBe(false);
    expect(result.newState.restartCount).toBe(1);
    expect(mockClient.recordHealingEvent).toHaveBeenCalledWith(
      "run-1",
      "dep-1",
      expect.objectContaining({ event_type: "restart_failed" }),
    );
  });

  it("records restart_failed when docker restart throws", async () => {
    vi.mocked(containerManager.restartContainer).mockRejectedValue(
      new Error("docker daemon unavailable"),
    );

    const result = await remediate(
      createRef(),
      "unhealthy",
      createRemediationState(),
      mockClient,
    );

    expect(result.action).toBe("restart");
    expect(result.success).toBe(false);
    expect(result.error).toBe("docker daemon unavailable");
    expect(result.newState.restartCount).toBe(1);
  });

  it("triggers rollback when restartCount >= 3 and previousImageTag exists", async () => {
    const healthChecker = await import("../health-checker");
    vi.mocked(containerManager.removeContainerIfExists).mockResolvedValue(
      undefined,
    );
    vi.mocked(containerManager.runContainer).mockResolvedValue("");
    vi.mocked(healthChecker.waitForHealthyViaDocker).mockResolvedValue({
      passed: true,
      statusCode: 200,
      responseTimeMs: 50,
    });
    vi.mocked(containerManager.stopContainer).mockResolvedValue(undefined);

    const state: RemediationState = {
      restartCount: 3,
      lastRestartAt: Date.now() - 60000,
      isRemediating: false,
    };

    const result = await remediate(createRef(), "unhealthy", state, mockClient);

    expect(result.action).toBe("rollback");
    expect(result.success).toBe(true);
    expect(mockClient.recordHealingEvent).toHaveBeenCalledWith(
      "run-1",
      "dep-1",
      expect.objectContaining({ event_type: "rollback_started" }),
    );
    expect(mockClient.recordHealingEvent).toHaveBeenCalledWith(
      "run-1",
      "dep-1",
      expect.objectContaining({ event_type: "rollback_succeeded" }),
    );
    expect(mockClient.updateDeployment).toHaveBeenCalledWith(
      "run-1",
      "dep-1",
      expect.objectContaining({ status: "rolled_back" }),
    );
  });

  it("records rollback_failed when no previousImageTag", async () => {
    const ref = createRef({ previousImageTag: null });
    const state: RemediationState = {
      restartCount: 3,
      lastRestartAt: Date.now() - 60000,
      isRemediating: false,
    };

    const result = await remediate(ref, "unhealthy", state, mockClient);

    expect(result.action).toBe("rollback");
    expect(result.success).toBe(false);
    expect(result.error).toContain("no previous revision");
  });

  it("increments restartCount correctly across multiple restarts", async () => {
    vi.mocked(containerManager.restartContainer).mockResolvedValue(undefined);
    vi.mocked(containerManager.isContainerRunning).mockResolvedValue(true);

    // First restart
    const promise1 = remediate(
      createRef(),
      "unhealthy",
      createRemediationState(),
      mockClient,
    );

    await vi.advanceTimersByTimeAsync(3000);
    const result1 = await promise1;
    expect(result1.newState.restartCount).toBe(1);

    // Second restart (expire the backoff)
    const stateAfterBackoff: RemediationState = {
      ...result1.newState,
      lastRestartAt: Date.now() - 10000,
    };

    const promise2 = remediate(
      createRef(),
      "unhealthy",
      stateAfterBackoff,
      mockClient,
    );

    await vi.advanceTimersByTimeAsync(3000);
    const result2 = await promise2;
    expect(result2.newState.restartCount).toBe(2);
  });
});
