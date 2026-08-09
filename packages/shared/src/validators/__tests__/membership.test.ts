import { describe, it, expect } from "vitest";
import {
  InviteMemberSchema,
  UpdateRoleSchema,
  hasMinRole,
  ROLE_HIERARCHY,
  ORG_ROLES,
} from "../membership";

describe("hasMinRole", () => {
  it("owner has all roles", () => {
    expect(hasMinRole("owner", "viewer")).toBe(true);
    expect(hasMinRole("owner", "developer")).toBe(true);
    expect(hasMinRole("owner", "admin")).toBe(true);
    expect(hasMinRole("owner", "owner")).toBe(true);
  });

  it("admin has admin, developer, viewer but not owner", () => {
    expect(hasMinRole("admin", "viewer")).toBe(true);
    expect(hasMinRole("admin", "developer")).toBe(true);
    expect(hasMinRole("admin", "admin")).toBe(true);
    expect(hasMinRole("admin", "owner")).toBe(false);
  });

  it("developer has developer and viewer but not admin or owner", () => {
    expect(hasMinRole("developer", "viewer")).toBe(true);
    expect(hasMinRole("developer", "developer")).toBe(true);
    expect(hasMinRole("developer", "admin")).toBe(false);
    expect(hasMinRole("developer", "owner")).toBe(false);
  });

  it("viewer only has viewer", () => {
    expect(hasMinRole("viewer", "viewer")).toBe(true);
    expect(hasMinRole("viewer", "developer")).toBe(false);
    expect(hasMinRole("viewer", "admin")).toBe(false);
    expect(hasMinRole("viewer", "owner")).toBe(false);
  });

  it("unknown role returns false", () => {
    expect(hasMinRole("unknown", "viewer")).toBe(false);
  });

  it("unknown minimum role returns false", () => {
    expect(hasMinRole("owner", "superadmin")).toBe(false);
  });
});

describe("ROLE_HIERARCHY", () => {
  it("has correct ordering", () => {
    expect(ROLE_HIERARCHY.viewer).toBeLessThan(ROLE_HIERARCHY.developer);
    expect(ROLE_HIERARCHY.developer).toBeLessThan(ROLE_HIERARCHY.admin);
    expect(ROLE_HIERARCHY.admin).toBeLessThan(ROLE_HIERARCHY.owner);
  });

  it("covers all ORG_ROLES", () => {
    for (const role of ORG_ROLES) {
      expect(ROLE_HIERARCHY[role]).toBeDefined();
    }
  });
});

describe("ORG_ROLES", () => {
  it("has four roles", () => {
    expect(ORG_ROLES).toHaveLength(4);
  });

  it("includes viewer, developer, admin, owner", () => {
    expect(ORG_ROLES).toContain("viewer");
    expect(ORG_ROLES).toContain("developer");
    expect(ORG_ROLES).toContain("admin");
    expect(ORG_ROLES).toContain("owner");
  });
});

describe("InviteMemberSchema", () => {
  it("accepts valid email and role", () => {
    const result = InviteMemberSchema.safeParse({
      email: "user@example.com",
      role: "developer",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
      expect(result.data.role).toBe("developer");
    }
  });

  it("normalizes email to lowercase", () => {
    const result = InviteMemberSchema.parse({
      email: "User@Example.COM",
      role: "viewer",
    });
    expect(result.email).toBe("user@example.com");
  });

  it("trims email whitespace", () => {
    const result = InviteMemberSchema.parse({
      email: "  user@example.com  ",
      role: "admin",
    });
    expect(result.email).toBe("user@example.com");
  });

  it("rejects invalid email", () => {
    expect(
      InviteMemberSchema.safeParse({ email: "not-an-email", role: "viewer" }).success,
    ).toBe(false);
  });

  it("rejects empty email", () => {
    expect(
      InviteMemberSchema.safeParse({ email: "", role: "viewer" }).success,
    ).toBe(false);
  });

  it("rejects email exceeding 255 characters", () => {
    const longEmail = `${"a".repeat(250)}@b.com`;
    expect(
      InviteMemberSchema.safeParse({ email: longEmail, role: "viewer" }).success,
    ).toBe(false);
  });

  it("accepts viewer role", () => {
    expect(
      InviteMemberSchema.safeParse({ email: "a@b.com", role: "viewer" }).success,
    ).toBe(true);
  });

  it("accepts developer role", () => {
    expect(
      InviteMemberSchema.safeParse({ email: "a@b.com", role: "developer" }).success,
    ).toBe(true);
  });

  it("accepts admin role", () => {
    expect(
      InviteMemberSchema.safeParse({ email: "a@b.com", role: "admin" }).success,
    ).toBe(true);
  });

  it("rejects owner role (cannot invite as owner)", () => {
    expect(
      InviteMemberSchema.safeParse({ email: "a@b.com", role: "owner" }).success,
    ).toBe(false);
  });

  it("rejects invalid role", () => {
    expect(
      InviteMemberSchema.safeParse({ email: "a@b.com", role: "superadmin" }).success,
    ).toBe(false);
  });

  it("rejects missing role", () => {
    expect(
      InviteMemberSchema.safeParse({ email: "a@b.com" }).success,
    ).toBe(false);
  });

  it("rejects missing email", () => {
    expect(
      InviteMemberSchema.safeParse({ role: "viewer" }).success,
    ).toBe(false);
  });
});

describe("UpdateRoleSchema", () => {
  it("accepts viewer", () => {
    expect(UpdateRoleSchema.safeParse({ role: "viewer" }).success).toBe(true);
  });

  it("accepts developer", () => {
    expect(UpdateRoleSchema.safeParse({ role: "developer" }).success).toBe(true);
  });

  it("accepts admin", () => {
    expect(UpdateRoleSchema.safeParse({ role: "admin" }).success).toBe(true);
  });

  it("rejects owner (ownership transfer is separate)", () => {
    expect(UpdateRoleSchema.safeParse({ role: "owner" }).success).toBe(false);
  });

  it("rejects invalid role", () => {
    expect(UpdateRoleSchema.safeParse({ role: "moderator" }).success).toBe(false);
  });

  it("rejects empty role", () => {
    expect(UpdateRoleSchema.safeParse({ role: "" }).success).toBe(false);
  });

  it("rejects missing role", () => {
    expect(UpdateRoleSchema.safeParse({}).success).toBe(false);
  });
});
