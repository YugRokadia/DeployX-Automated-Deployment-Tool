import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditEvent } from "../audit";

function createMockSupabase(
  insertResult: { error: unknown } = { error: null },
) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as unknown as SupabaseClient, from, insert };
}

const baseParams = {
  org_id: "org-1",
  user_id: "user-1",
  action: "create" as const,
  resource_type: "project",
  resource_id: "proj-1",
} as const;

describe("recordAuditEvent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts correctly with all params", async () => {
    const details = { name: "My Project" };
    const ipAddress = "192.168.1.1";
    const { client, from, insert } = createMockSupabase();

    await recordAuditEvent(client, {
      ...baseParams,
      details,
      ip_address: ipAddress,
    });

    expect(from).toHaveBeenCalledWith("audit_events");
    expect(insert).toHaveBeenCalledWith({
      org_id: baseParams.org_id,
      user_id: baseParams.user_id,
      action: baseParams.action,
      resource_type: baseParams.resource_type,
      resource_id: baseParams.resource_id,
      details,
      ip_address: ipAddress,
    });
  });

  it("swallows errors gracefully and logs them", async () => {
    const dbError = new Error("connection refused");
    const { client } = createMockSupabase();
    // Override insert to throw
    (client as any).from = vi.fn().mockReturnValue({
      insert: vi.fn().mockRejectedValue(dbError),
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(recordAuditEvent(client, baseParams)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[audit] Failed to record event:",
      dbError,
    );
  });

  it("passes null for optional details and ip_address when not provided", async () => {
    const { client, insert } = createMockSupabase();

    await recordAuditEvent(client, baseParams);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: baseParams.org_id,
        user_id: baseParams.user_id,
        action: baseParams.action,
        resource_type: baseParams.resource_type,
        resource_id: baseParams.resource_id,
        details: null,
        ip_address: null,
      }),
    );
  });
});
