import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import { executeStep } from "../step-executor";
import type { LogStreamer } from "../../logging/log-streamer";

function makeSubprocess(
  exitCode: number,
  timedOut: boolean,
  stdoutChunks: string[] = [],
  stderrChunks: string[] = [],
) {
  const stdout = new Readable({
    read() {
      for (const c of stdoutChunks) this.push(c);
      this.push(null);
    },
  });
  const stderr = new Readable({
    read() {
      for (const c of stderrChunks) this.push(c);
      this.push(null);
    },
  });
  const promise = Promise.resolve({ exitCode, timedOut, stdout, stderr });
  return Object.assign(promise, { stdout, stderr });
}

// Mock execa with a default implementation
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

function createMockLogStreamer(): LogStreamer {
  return {
    push: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  } as unknown as LogStreamer;
}

describe("executeStep", () => {
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("execa");
    mockExeca = mod.execa as unknown as ReturnType<typeof vi.fn>;
    // Reset to default: successful command that outputs "hello world"
    mockExeca.mockImplementation(() =>
      makeSubprocess(0, false, ["hello world\n"], []),
    );
  });

  it("executes a simple command and returns exit code 0", async () => {
    const logStreamer = createMockLogStreamer();

    const result = await executeStep({
      command: "echo hello",
      cwd: "/tmp",
      logStreamer,
    });

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("streams stdout lines to logStreamer with level info", async () => {
    const logStreamer = createMockLogStreamer();

    await executeStep({
      command: "echo hello",
      cwd: "/tmp",
      logStreamer,
      taskRunId: "task-1",
      stepRunId: "step-1",
    });

    expect(logStreamer.push).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        message: "hello world",
        task_run_id: "task-1",
        step_run_id: "step-1",
      }),
    );
  });

  it("passes timeout to execa", async () => {
    const logStreamer = createMockLogStreamer();

    await executeStep({
      command: "sleep 100",
      cwd: "/tmp",
      timeoutSeconds: 30,
      logStreamer,
    });

    expect(mockExeca).toHaveBeenCalledWith(
      "sh",
      ["-c", "sleep 100"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("wraps command in docker run when image is specified", async () => {
    const logStreamer = createMockLogStreamer();

    await executeStep({
      command: "npm test",
      cwd: "/tmp/workspace",
      image: "node:20",
      logStreamer,
    });

    expect(mockExeca).toHaveBeenCalledWith(
      "sh",
      ["-c", expect.stringContaining("docker run --rm")],
      expect.anything(),
    );
    expect(mockExeca).toHaveBeenCalledWith(
      "sh",
      ["-c", expect.stringContaining("node:20")],
      expect.anything(),
    );
  });

  it("handles non-zero exit code", async () => {
    mockExeca.mockImplementation(() =>
      makeSubprocess(1, false, [], ["error msg\n"]),
    );

    const logStreamer = createMockLogStreamer();

    const result = await executeStep({
      command: "false",
      cwd: "/tmp",
      logStreamer,
    });

    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
  });

  it("streams stderr to logStreamer with level warn", async () => {
    mockExeca.mockImplementation(() =>
      makeSubprocess(1, false, [], ["warning line\n"]),
    );

    const logStreamer = createMockLogStreamer();

    await executeStep({
      command: "bad-cmd",
      cwd: "/tmp",
      logStreamer,
      taskRunId: "t1",
    });

    expect(logStreamer.push).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warn",
        message: "warning line",
        task_run_id: "t1",
      }),
    );
  });

  it("reports timedOut when execa times out", async () => {
    mockExeca.mockImplementation(() =>
      makeSubprocess(undefined as unknown as number, true),
    );

    const logStreamer = createMockLogStreamer();

    const result = await executeStep({
      command: "sleep 999",
      cwd: "/tmp",
      timeoutSeconds: 1,
      logStreamer,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(1); // Falls back to 1 when undefined
  });

  it("merges env variables with process.env", async () => {
    const logStreamer = createMockLogStreamer();

    await executeStep({
      command: "echo $MY_VAR",
      cwd: "/tmp",
      env: { MY_VAR: "test-value" },
      logStreamer,
    });

    expect(mockExeca).toHaveBeenCalledWith(
      "sh",
      expect.anything(),
      expect.objectContaining({
        env: expect.objectContaining({ MY_VAR: "test-value" }),
      }),
    );
  });
});
