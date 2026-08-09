import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ensureNetwork,
  runContainer,
  stopContainer,
  removeContainer,
  inspectContainer,
  isContainerRunning,
  getContainerLogs,
  removeContainerIfExists,
} from "../container-manager";

// Mock execa
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

describe("ensureNetwork", () => {
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("execa");
    mockExeca = mod.execa as unknown as ReturnType<typeof vi.fn>;
  });

  it("does nothing if network already exists", async () => {
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await ensureNetwork("deployx-net");

    // Called twice for inspect (the source does two inspect calls), never for create
    expect(mockExeca).toHaveBeenCalledWith(
      "docker",
      ["network", "inspect", "deployx-net"],
      expect.anything(),
    );
    expect(mockExeca).not.toHaveBeenCalledWith(
      "docker",
      ["network", "create", "deployx-net"],
    );
  });

  it("creates network if inspect returns non-zero exit code", async () => {
    mockExeca
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "" }) // first inspect
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "" }) // second inspect
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }); // create

    await ensureNetwork("deployx-net");

    expect(mockExeca).toHaveBeenCalledWith(
      "docker",
      ["network", "create", "deployx-net"],
    );
  });
});

describe("runContainer", () => {
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("execa");
    mockExeca = mod.execa as unknown as ReturnType<typeof vi.fn>;
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: "container-id-abc123", stderr: "" });
  });

  it("builds correct docker run args with all options", async () => {
    const containerId = await runContainer({
      name: "my-app-blue",
      image: "my-app:latest",
      network: "deployx-net",
      detach: true,
      restart: "unless-stopped",
      ports: [{ host: 10000, container: 3000 }],
      env: { NODE_ENV: "production", PORT: "3000" },
      labels: { "deployx.project": "my-app", "deployx.slot": "blue" },
    });

    expect(containerId).toBe("container-id-abc123");

    const callArgs = mockExeca.mock.calls[0];
    expect(callArgs[0]).toBe("docker");
    const args: string[] = callArgs[1];

    expect(args[0]).toBe("run");
    expect(args).toContain("-d");
    expect(args).toContain("--name");
    expect(args[args.indexOf("--name") + 1]).toBe("my-app-blue");
    expect(args).toContain("--network");
    expect(args[args.indexOf("--network") + 1]).toBe("deployx-net");
    expect(args).toContain("--restart");
    expect(args[args.indexOf("--restart") + 1]).toBe("unless-stopped");
    expect(args).toContain("-p");
    expect(args[args.indexOf("-p") + 1]).toBe("10000:3000");
    expect(args).toContain("-e");
    expect(args).toContain("NODE_ENV=production");
    expect(args).toContain("--label");
    expect(args).toContain("deployx.project=my-app");
    // Image should be the last arg
    expect(args[args.length - 1]).toBe("my-app:latest");
  });

  it("omits optional flags when not provided", async () => {
    await runContainer({
      name: "simple-app",
      image: "node:20",
      network: "deployx-net",
      detach: false,
    });

    const args: string[] = mockExeca.mock.calls[0][1];

    expect(args).not.toContain("-d");
    expect(args).not.toContain("--restart");
    expect(args).not.toContain("-p");
    expect(args).not.toContain("-e");
    expect(args).not.toContain("--label");
  });
});

describe("stopContainer", () => {
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("execa");
    mockExeca = mod.execa as unknown as ReturnType<typeof vi.fn>;
  });

  it("calls docker stop with timeout", async () => {
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await stopContainer("my-app-blue", 15);

    expect(mockExeca).toHaveBeenCalledWith(
      "docker",
      ["stop", "-t", "15", "my-app-blue"],
      { reject: false },
    );
  });

  it("uses default timeout of 10 seconds", async () => {
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await stopContainer("my-app-blue");

    expect(mockExeca).toHaveBeenCalledWith(
      "docker",
      ["stop", "-t", "10", "my-app-blue"],
      { reject: false },
    );
  });

  it("ignores 'No such container' errors", async () => {
    mockExeca.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "Error: No such container: my-app-blue",
    });

    await expect(stopContainer("my-app-blue")).resolves.toBeUndefined();
  });

  it("throws on other errors", async () => {
    mockExeca.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "permission denied",
    });

    await expect(stopContainer("my-app-blue")).rejects.toThrow(
      "Failed to stop container my-app-blue: permission denied",
    );
  });
});

describe("removeContainer", () => {
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("execa");
    mockExeca = mod.execa as unknown as ReturnType<typeof vi.fn>;
  });

  it("calls docker rm -f", async () => {
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await removeContainer("my-app-blue");

    expect(mockExeca).toHaveBeenCalledWith(
      "docker",
      ["rm", "-f", "my-app-blue"],
      { reject: false },
    );
  });

  it("ignores 'No such container' errors", async () => {
    mockExeca.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "Error: No such container: my-app-blue",
    });

    await expect(removeContainer("my-app-blue")).resolves.toBeUndefined();
  });

  it("throws on other errors", async () => {
    mockExeca.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "container is running",
    });

    await expect(removeContainer("my-app-blue")).rejects.toThrow(
      "Failed to remove container my-app-blue: container is running",
    );
  });
});

describe("inspectContainer", () => {
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("execa");
    mockExeca = mod.execa as unknown as ReturnType<typeof vi.fn>;
  });

  it("parses JSON output correctly", async () => {
    const dockerOutput = JSON.stringify([
      {
        Id: "abc123def456",
        Name: "/my-app-blue",
        State: { Status: "running" },
        Config: {
          Image: "my-app:latest",
          Labels: { "deployx.project": "my-app" },
        },
      },
    ]);

    mockExeca.mockResolvedValue({ exitCode: 0, stdout: dockerOutput, stderr: "" });

    const result = await inspectContainer("my-app-blue");

    expect(result).toEqual({
      id: "abc123def456",
      name: "my-app-blue",
      state: "running",
      image: "my-app:latest",
      labels: { "deployx.project": "my-app" },
    });
  });

  it("strips leading slash from container name", async () => {
    const dockerOutput = JSON.stringify([
      {
        Id: "abc123",
        Name: "/my-app-blue",
        State: { Status: "running" },
        Config: { Image: "img", Labels: {} },
      },
    ]);

    mockExeca.mockResolvedValue({ exitCode: 0, stdout: dockerOutput, stderr: "" });

    const result = await inspectContainer("my-app-blue");
    expect(result?.name).toBe("my-app-blue");
  });

  it("returns null on non-zero exit code", async () => {
    mockExeca.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "not found" });

    const result = await inspectContainer("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null on invalid JSON", async () => {
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: "not json", stderr: "" });

    const result = await inspectContainer("my-app-blue");
    expect(result).toBeNull();
  });
});

describe("isContainerRunning", () => {
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("execa");
    mockExeca = mod.execa as unknown as ReturnType<typeof vi.fn>;
  });

  it("returns true when container state is running", async () => {
    const dockerOutput = JSON.stringify([
      {
        Id: "abc123",
        Name: "/my-app",
        State: { Status: "running" },
        Config: { Image: "img", Labels: {} },
      },
    ]);

    mockExeca.mockResolvedValue({ exitCode: 0, stdout: dockerOutput, stderr: "" });

    const result = await isContainerRunning("my-app");
    expect(result).toBe(true);
  });

  it("returns false when container state is exited", async () => {
    const dockerOutput = JSON.stringify([
      {
        Id: "abc123",
        Name: "/my-app",
        State: { Status: "exited" },
        Config: { Image: "img", Labels: {} },
      },
    ]);

    mockExeca.mockResolvedValue({ exitCode: 0, stdout: dockerOutput, stderr: "" });

    const result = await isContainerRunning("my-app");
    expect(result).toBe(false);
  });

  it("returns false when container does not exist", async () => {
    mockExeca.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "not found" });

    const result = await isContainerRunning("nonexistent");
    expect(result).toBe(false);
  });
});

describe("getContainerLogs", () => {
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("execa");
    mockExeca = mod.execa as unknown as ReturnType<typeof vi.fn>;
  });

  it("returns log lines from stdout and stderr", async () => {
    mockExeca.mockResolvedValue({
      exitCode: 0,
      stdout: "line1\nline2",
      stderr: "warn1",
    });

    const logs = await getContainerLogs("my-app");

    expect(logs).toEqual(["line1", "line2", "warn1"]);
  });

  it("passes tail argument to docker logs", async () => {
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: "line1", stderr: "" });

    await getContainerLogs("my-app", 50);

    expect(mockExeca).toHaveBeenCalledWith(
      "docker",
      ["logs", "--tail", "50", "my-app"],
      { reject: false },
    );
  });

  it("uses default tail of 100", async () => {
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: "line1", stderr: "" });

    await getContainerLogs("my-app");

    expect(mockExeca).toHaveBeenCalledWith(
      "docker",
      ["logs", "--tail", "100", "my-app"],
      { reject: false },
    );
  });

  it("returns empty array on failure", async () => {
    mockExeca.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "error" });

    const logs = await getContainerLogs("nonexistent");
    expect(logs).toEqual([]);
  });
});

describe("removeContainerIfExists", () => {
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("execa");
    mockExeca = mod.execa as unknown as ReturnType<typeof vi.fn>;
  });

  it("stops and removes container if it exists", async () => {
    const dockerOutput = JSON.stringify([
      {
        Id: "abc123",
        Name: "/my-app",
        State: { Status: "running" },
        Config: { Image: "img", Labels: {} },
      },
    ]);

    // inspect succeeds, stop succeeds, rm succeeds
    mockExeca
      .mockResolvedValueOnce({ exitCode: 0, stdout: dockerOutput, stderr: "" }) // inspect
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }) // stop
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }); // rm

    await removeContainerIfExists("my-app");

    // Verify stop was called with timeout 5
    expect(mockExeca).toHaveBeenCalledWith(
      "docker",
      ["stop", "-t", "5", "my-app"],
      { reject: false },
    );

    // Verify rm was called
    expect(mockExeca).toHaveBeenCalledWith(
      "docker",
      ["rm", "-f", "my-app"],
      { reject: false },
    );
  });

  it("does nothing if container does not exist", async () => {
    mockExeca.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "not found" });

    await removeContainerIfExists("nonexistent");

    // Only inspect was called (returns null), no stop or rm
    expect(mockExeca).toHaveBeenCalledTimes(1);
    expect(mockExeca).toHaveBeenCalledWith(
      "docker",
      ["inspect", "--format", "json", "nonexistent"],
      { reject: false },
    );
  });
});
