import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWorkspace, getHeadSha } from "../workspace";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

// Mock execa for git commands
vi.mock("execa", () => ({
  execaCommand: vi.fn().mockResolvedValue({ stdout: "abc1234567890def1234567890abcdef12345678" }),
}));

describe("createWorkspace", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ws-test-"));
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("creates a workspace directory and calls git clone", async () => {
    const { execaCommand } = await import("execa");

    const workspace = await createWorkspace({
      runId: "test-run-12345678",
      gitRepoUrl: "https://github.com/user/repo.git",
      gitBranch: "main",
      gitSha: null,
      gitCloneToken: null,
    });

    expect(workspace.path).toBeTruthy();
    expect(typeof workspace.cleanup).toBe("function");

    // Verify git clone was called
    expect(execaCommand).toHaveBeenCalledWith(
      expect.stringContaining("git clone --depth 1 --branch main"),
      expect.objectContaining({ timeout: 120_000 }),
    );

    await workspace.cleanup();
  });

  it("fetches specific SHA when provided and differs from HEAD", async () => {
    const { execaCommand } = await import("execa");

    // HEAD returns different SHA than requested
    (execaCommand as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ stdout: "" }) // git clone
      .mockResolvedValueOnce({ stdout: "aaaaaaa0000000000000000000000000000000000" }) // git rev-parse HEAD
      .mockResolvedValueOnce({ stdout: "" }) // git fetch
      .mockResolvedValueOnce({ stdout: "" }); // git checkout

    const workspace = await createWorkspace({
      runId: "test-run-12345678",
      gitRepoUrl: "https://github.com/user/repo.git",
      gitBranch: "main",
      gitSha: "bbbbbbb1111111111111111111111111111111111",
      gitCloneToken: null,
    });

    // Should have called git fetch and git checkout
    expect(execaCommand).toHaveBeenCalledWith(
      expect.stringContaining("git fetch --depth 1 origin bbbbbbb"),
      expect.anything(),
    );
    expect(execaCommand).toHaveBeenCalledWith(
      expect.stringContaining("git checkout bbbbbbb"),
      expect.anything(),
    );

    await workspace.cleanup();
  });

  it("skips fetch when HEAD already matches SHA", async () => {
    const { execaCommand } = await import("execa");

    (execaCommand as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ stdout: "" }) // git clone
      .mockResolvedValueOnce({ stdout: "abc1234567890def" }); // git rev-parse HEAD matches

    const workspace = await createWorkspace({
      runId: "test-run-12345678",
      gitRepoUrl: "https://github.com/user/repo.git",
      gitBranch: "main",
      gitSha: "abc1234567890def",
      gitCloneToken: null,
    });

    // Only clone and rev-parse, no fetch/checkout
    expect(execaCommand).toHaveBeenCalledTimes(2);

    await workspace.cleanup();
  });

  it("cleans up workspace on git clone failure", async () => {
    const { execaCommand } = await import("execa");

    (execaCommand as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("git clone failed: repository not found"),
    );

    await expect(
      createWorkspace({
        runId: "test-run-12345678",
        gitRepoUrl: "https://github.com/user/nonexistent.git",
        gitBranch: "main",
        gitSha: null,
        gitCloneToken: null,
      }),
    ).rejects.toThrow("Failed to create workspace");
  });
});

describe("getHeadSha", () => {
  it("returns trimmed SHA from git rev-parse", async () => {
    const { execaCommand } = await import("execa");
    (execaCommand as ReturnType<typeof vi.fn>).mockResolvedValue({
      stdout: "  abc1234567890def  \n",
    });

    const sha = await getHeadSha("/some/path");
    expect(sha).toBe("abc1234567890def");
  });
});
