import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveVariables, type VariableContext } from "../variable-resolver";

const baseContext: VariableContext = {
  git: {
    sha: "abc1234567890def",
    short_sha: "abc1234",
    branch: "main",
  },
  project: {
    name: "My App",
    slug: "my-app",
  },
  env: {
    NODE_ENV: "production",
    API_KEY: "secret-key-123",
  },
};

describe("resolveVariables", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves git.sha", () => {
    expect(resolveVariables("Image: ${{ git.sha }}", baseContext)).toBe(
      "Image: abc1234567890def",
    );
  });

  it("resolves git.short_sha", () => {
    expect(resolveVariables("Tag: ${{ git.short_sha }}", baseContext)).toBe(
      "Tag: abc1234",
    );
  });

  it("resolves git.branch", () => {
    expect(resolveVariables("Branch: ${{ git.branch }}", baseContext)).toBe(
      "Branch: main",
    );
  });

  it("resolves project.name", () => {
    expect(resolveVariables("Project: ${{ project.name }}", baseContext)).toBe(
      "Project: My App",
    );
  });

  it("resolves project.slug", () => {
    expect(resolveVariables("Slug: ${{ project.slug }}", baseContext)).toBe(
      "Slug: my-app",
    );
  });

  it("resolves env variables", () => {
    expect(resolveVariables("Env: ${{ env.NODE_ENV }}", baseContext)).toBe(
      "Env: production",
    );
  });

  it("resolves missing env variable to empty string", () => {
    expect(resolveVariables("Val: ${{ env.MISSING }}", baseContext)).toBe(
      "Val: ",
    );
  });

  it("resolves multiple variables in one string", () => {
    const template = "ghcr.io/${{ project.slug }}:${{ git.short_sha }}";
    expect(resolveVariables(template, baseContext)).toBe(
      "ghcr.io/my-app:abc1234",
    );
  });

  it("handles whitespace variations in variable syntax", () => {
    expect(resolveVariables("${{git.sha}}", baseContext)).toBe("abc1234567890def");
    expect(resolveVariables("${{  git.sha  }}", baseContext)).toBe("abc1234567890def");
  });

  it("leaves unknown variables as-is and warns", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = resolveVariables("${{ unknown.var }}", baseContext);
    expect(result).toBe("${{ unknown.var }}");
    expect(warnSpy).toHaveBeenCalledWith("Unknown variable: unknown.var");
  });

  it("returns plain strings without variables unchanged", () => {
    expect(resolveVariables("echo hello world", baseContext)).toBe(
      "echo hello world",
    );
  });

  it("handles empty template", () => {
    expect(resolveVariables("", baseContext)).toBe("");
  });
});
