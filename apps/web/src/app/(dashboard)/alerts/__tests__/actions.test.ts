import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────

const { mockSupabase, mockUser, mockOrg, mockRole } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn() },
  mockUser: { id: "user-1" },
  mockOrg: { id: "org-1" },
  mockRole: "admin",
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserWithOrg: vi.fn().mockResolvedValue({
    supabase: mockSupabase,
    user: mockUser,
    org: mockOrg,
    role: mockRole,
  }),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  createAlertRule,
  updateAlertRule,
  toggleAlertRule,
  deleteAlertRule,
} from "../actions";

// ── Helpers ────────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

function mockChain(overrides: Record<string, unknown> = {}) {
  const result = { data: { id: "rule-1" }, error: null, ...overrides };
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const eqSecond = vi.fn().mockReturnValue({ select, single, ...result });
  const eq = vi.fn().mockReturnValue({ eq: eqSecond, select, single, ...result });
  const insert = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const deleteFn = vi.fn().mockReturnValue({ eq });

  return { insert, update, delete: deleteFn, eq, select, single, eqSecond };
}

// ── Tests ──────────────────────────────────────────────────────

describe("Alert rule server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createAlertRule", () => {
    it("creates a rule with valid input", async () => {
      const chain = mockChain();
      mockSupabase.from.mockReturnValue(chain);

      const fd = makeFormData({
        name: "High failure rate",
        metric: "success_rate",
        operator: "lt",
        threshold: "95",
        severity: "critical",
      });

      const result = await createAlertRule({}, fd);

      expect(result).toEqual({ success: true });
      expect(mockSupabase.from).toHaveBeenCalledWith("alert_rules");
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: mockOrg.id,
          name: "High failure rate",
          metric: "success_rate",
          operator: "lt",
          threshold: 95,
          severity: "critical",
          created_by: mockUser.id,
        }),
      );
    });
  });

  describe("updateAlertRule", () => {
    it("updates a rule with valid input", async () => {
      const chain = mockChain();
      mockSupabase.from.mockReturnValue(chain);

      const fd = makeFormData({
        name: "Updated name",
        threshold: "90",
      });

      const result = await updateAlertRule("rule-1", {}, fd);

      expect(result).toEqual({ success: true });
      expect(mockSupabase.from).toHaveBeenCalledWith("alert_rules");
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Updated name",
          threshold: 90,
        }),
      );
    });
  });

  describe("toggleAlertRule", () => {
    it("toggles is_active from true to false", async () => {
      // First call: select to read current state
      const selectChain = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { is_active: true },
                error: null,
              }),
            }),
          }),
        }),
      };
      // Second call: update
      const updateChain = {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectChain : updateChain;
      });

      const result = await toggleAlertRule("rule-1");

      expect(result).toEqual({ success: true });
      expect(updateChain.update).toHaveBeenCalledWith({ is_active: false });
    });
  });

  describe("deleteAlertRule", () => {
    it("deletes the rule", async () => {
      const eqSecond = vi.fn().mockResolvedValue({ error: null });
      const eq = vi.fn().mockReturnValue({ eq: eqSecond });
      const deleteFn = vi.fn().mockReturnValue({ eq });

      mockSupabase.from.mockReturnValue({ delete: deleteFn });

      const result = await deleteAlertRule("rule-1");

      expect(result).toEqual({ success: true });
      expect(mockSupabase.from).toHaveBeenCalledWith("alert_rules");
      expect(deleteFn).toHaveBeenCalled();
      expect(eq).toHaveBeenCalledWith("id", "rule-1");
      expect(eqSecond).toHaveBeenCalledWith("org_id", mockOrg.id);
    });
  });
});
