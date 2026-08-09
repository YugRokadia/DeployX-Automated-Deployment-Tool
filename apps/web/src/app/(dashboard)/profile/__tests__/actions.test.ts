import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────

const { mockSupabase, mockUser, mockOrg } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn() },
  mockUser: { id: "user-1" },
  mockOrg: { id: "org-1" },
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserWithOrg: vi.fn().mockResolvedValue({
    supabase: mockSupabase,
    user: mockUser,
    org: mockOrg,
    role: "developer",
  }),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { updateProfile } from "../actions";

// ── Helpers ────────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

// ── Tests ──────────────────────────────────────────────────────

describe("updateProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves profile with valid display name", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    mockSupabase.from.mockReturnValue({ update });

    const fd = makeFormData({ display_name: "Alice Smith" });

    const result = await updateProfile({}, fd);

    expect(result).toEqual({ success: true });
    expect(mockSupabase.from).toHaveBeenCalledWith("user_profiles");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name: "Alice Smith",
        updated_at: expect.any(String),
      }),
    );
    expect(eq).toHaveBeenCalledWith("id", mockUser.id);
  });

  it("returns field error for empty display name", async () => {
    const fd = makeFormData({ display_name: "" });

    const result = await updateProfile({}, fd);

    expect(result.fieldErrors).toBeDefined();
    expect(result.fieldErrors!.display_name).toBeDefined();
    expect(result.fieldErrors!.display_name!.length).toBeGreaterThan(0);
    expect(result.success).toBeUndefined();
  });

  it("returns field error for invalid avatar URL", async () => {
    const fd = makeFormData({
      display_name: "Alice",
      avatar_url: "not-a-valid-url",
    });

    const result = await updateProfile({}, fd);

    expect(result.fieldErrors).toBeDefined();
    expect(result.fieldErrors!.avatar_url).toBeDefined();
    expect(result.fieldErrors!.avatar_url!.length).toBeGreaterThan(0);
    expect(result.success).toBeUndefined();
  });
});
