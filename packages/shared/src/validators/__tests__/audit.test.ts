import { describe, it, expect } from "vitest";
import { AuditEventQuerySchema, CreateAuditEventSchema } from "../audit";

describe("AuditEventQuerySchema", () => {
  it("parses valid query with all optional fields", () => {
    const input = {
      resource_type: "project",
      user_id: "00000000-0000-0000-0000-000000000001",
      action: "create" as const,
      from_date: "2025-01-01T00:00:00Z",
      to_date: "2025-12-31T23:59:59Z",
      limit: 100,
      offset: 10,
    };

    const result = AuditEventQuerySchema.parse(input);

    expect(result).toEqual(input);
  });

  it("rejects invalid action value", () => {
    const result = AuditEventQuerySchema.safeParse({
      action: "destroy",
    });

    expect(result.success).toBe(false);
  });
});

describe("CreateAuditEventSchema", () => {
  it("parses valid create event", () => {
    const input = {
      action: "trigger" as const,
      resource_type: "pipeline",
      resource_id: "00000000-0000-0000-0000-000000000001",
      details: { pipeline_name: "deploy-prod" },
      ip_address: "192.168.1.1",
    };

    const result = CreateAuditEventSchema.parse(input);

    expect(result).toEqual(input);
  });

  it("rejects missing required fields", () => {
    const result = CreateAuditEventSchema.safeParse({
      resource_type: "pipeline",
      resource_id: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.success).toBe(false);
  });
});
