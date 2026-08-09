import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateTags, checkDocker } from "../docker-client";

// Mock execa
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

describe("generateTags", () => {
  it("generates three standard tags", () => {
    const tags = generateTags("ghcr.io", "user/app", "abc1234567890", "main");
    expect(tags).toEqual([
      "ghcr.io/user/app:abc1234",
      "ghcr.io/user/app:main",
      "ghcr.io/user/app:latest",
    ]);
  });

  it("uses first 7 chars of SHA for short tag", () => {
    const tags = generateTags("docker.io", "org/service", "deadbeef12345", "develop");
    expect(tags[0]).toBe("docker.io/org/service:deadbee");
  });

  it("sanitizes branch name with slashes", () => {
    const tags = generateTags("ghcr.io", "user/app", "abc1234567890", "feature/my-thing");
    expect(tags[1]).toBe("ghcr.io/user/app:feature-my-thing");
  });

  it("sanitizes branch name with special characters", () => {
    const tags = generateTags("ghcr.io", "user/app", "abc1234567890", "fix/bug@123");
    expect(tags[1]).toBe("ghcr.io/user/app:fix-bug-123");
  });

  it("preserves dots, hyphens, and underscores in branch name", () => {
    const tags = generateTags("ghcr.io", "user/app", "abc1234567890", "release-1.0_rc1");
    expect(tags[1]).toBe("ghcr.io/user/app:release-1.0_rc1");
  });
});

describe("checkDocker", () => {
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("execa");
    mockExeca = mod.execa as unknown as ReturnType<typeof vi.fn>;
    // Default: docker is available
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: "24.0.0" });
  });

  it("returns true when docker is available", async () => {
    const result = await checkDocker();
    expect(result).toBe(true);
  });

  it("returns false when docker command fails", async () => {
    mockExeca.mockResolvedValue({ exitCode: 1, stdout: "" });

    const result = await checkDocker();
    expect(result).toBe(false);
  });

  it("returns false when docker throws", async () => {
    mockExeca.mockRejectedValue(new Error("not found"));

    const result = await checkDocker();
    expect(result).toBe(false);
  });
});
