import { describe, it, expect } from "vitest";
import {
  GitHubPushEventSchema,
  WebhookConfigSchema,
  extractBranchFromRef,
  matchesBranchFilter,
} from "../webhook";

describe("GitHubPushEventSchema", () => {
  const validPush = {
    ref: "refs/heads/main",
    after: "abc123def456",
    repository: { full_name: "user/repo" },
    head_commit: {
      id: "abc123",
      message: "fix: resolve issue",
      author: { name: "Test", email: "test@example.com" },
    },
  };

  it("accepts a valid push event", () => {
    const result = GitHubPushEventSchema.safeParse(validPush);
    expect(result.success).toBe(true);
  });

  it("accepts push with null head_commit (force push with no new commits)", () => {
    const result = GitHubPushEventSchema.safeParse({
      ...validPush,
      head_commit: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts push with deleted flag", () => {
    const result = GitHubPushEventSchema.safeParse({
      ...validPush,
      deleted: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deleted).toBe(true);
    }
  });

  it("rejects missing ref", () => {
    const { ref: _, ...noRef } = validPush;
    expect(GitHubPushEventSchema.safeParse(noRef).success).toBe(false);
  });

  it("rejects empty ref", () => {
    expect(
      GitHubPushEventSchema.safeParse({ ...validPush, ref: "" }).success,
    ).toBe(false);
  });

  it("rejects missing after", () => {
    const { after: _, ...noAfter } = validPush;
    expect(GitHubPushEventSchema.safeParse(noAfter).success).toBe(false);
  });

  it("rejects missing repository", () => {
    const { repository: _, ...noRepo } = validPush;
    expect(GitHubPushEventSchema.safeParse(noRepo).success).toBe(false);
  });
});

describe("WebhookConfigSchema", () => {
  it("accepts empty input (all fields optional)", () => {
    expect(WebhookConfigSchema.safeParse({}).success).toBe(true);
  });

  it("accepts valid branch filter", () => {
    const result = WebhookConfigSchema.safeParse({ branch_filter: "main" });
    expect(result.success).toBe(true);
  });

  it("accepts null branch filter", () => {
    const result = WebhookConfigSchema.safeParse({ branch_filter: null });
    expect(result.success).toBe(true);
  });

  it("accepts valid pipeline definition ID", () => {
    const result = WebhookConfigSchema.safeParse({
      pipeline_definition_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID for pipeline definition", () => {
    expect(
      WebhookConfigSchema.safeParse({ pipeline_definition_id: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("rejects overly long branch filter", () => {
    expect(
      WebhookConfigSchema.safeParse({ branch_filter: "x".repeat(256) }).success,
    ).toBe(false);
  });

  it("trims branch filter whitespace", () => {
    const result = WebhookConfigSchema.parse({ branch_filter: "  main  " });
    expect(result.branch_filter).toBe("main");
  });
});

describe("extractBranchFromRef", () => {
  it("extracts branch from refs/heads/main", () => {
    expect(extractBranchFromRef("refs/heads/main")).toBe("main");
  });

  it("extracts branch from refs/heads/feature/foo", () => {
    expect(extractBranchFromRef("refs/heads/feature/foo")).toBe("feature/foo");
  });

  it("returns null for tag refs", () => {
    expect(extractBranchFromRef("refs/tags/v1.0.0")).toBeNull();
  });

  it("returns null for non-standard refs", () => {
    expect(extractBranchFromRef("refs/pull/42/head")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractBranchFromRef("")).toBeNull();
  });
});

describe("matchesBranchFilter", () => {
  it("matches when filter is null (all branches)", () => {
    expect(matchesBranchFilter("main", null)).toBe(true);
  });

  it("matches when filter is empty string", () => {
    expect(matchesBranchFilter("main", "")).toBe(true);
  });

  it("matches when filter is whitespace-only", () => {
    expect(matchesBranchFilter("main", "  ")).toBe(true);
  });

  it("matches exact branch name", () => {
    expect(matchesBranchFilter("main", "main")).toBe(true);
  });

  it("rejects non-matching branch", () => {
    expect(matchesBranchFilter("develop", "main")).toBe(false);
  });

  it("matches wildcard pattern release/*", () => {
    expect(matchesBranchFilter("release/1.0", "release/*")).toBe(true);
  });

  it("single * does not match nested paths", () => {
    expect(matchesBranchFilter("release/1.0/hotfix", "release/*")).toBe(false);
  });

  it("matches ** for nested paths", () => {
    expect(matchesBranchFilter("feature/team/task", "feature/**")).toBe(true);
  });

  it("matches feature/* for single-level", () => {
    expect(matchesBranchFilter("feature/login", "feature/*")).toBe(true);
  });

  it("rejects feature/* for nested", () => {
    expect(matchesBranchFilter("feature/auth/oauth", "feature/*")).toBe(false);
  });
});
