import { describe, it, expect } from "vitest";
import { CreateAlertRuleSchema, UpdateAlertRuleSchema } from "../alert";

describe("CreateAlertRuleSchema", () => {
  it("parses valid create alert rule with all fields", () => {
    const input = {
      name: "High failure rate",
      metric: "success_rate",
      operator: "lt",
      threshold: 0.95,
      severity: "critical" as const,
      project_id: "00000000-0000-0000-0000-000000000001",
      cooldown_minutes: 30,
    };

    const result = CreateAlertRuleSchema.parse(input);

    expect(result).toEqual(input);
  });

  it("rejects missing name", () => {
    const result = CreateAlertRuleSchema.safeParse({
      metric: "success_rate",
      operator: "gt",
      threshold: 100,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid metric", () => {
    const result = CreateAlertRuleSchema.safeParse({
      name: "CPU Alert",
      metric: "cpu_usage",
      operator: "gt",
      threshold: 80,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid operator", () => {
    const result = CreateAlertRuleSchema.safeParse({
      name: "Rate Alert",
      metric: "success_rate",
      operator: "ne",
      threshold: 0.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-finite threshold", () => {
    const result = CreateAlertRuleSchema.safeParse({
      name: "Infinite Alert",
      metric: "avg_duration_ms",
      operator: "gt",
      threshold: Infinity,
    });

    expect(result.success).toBe(false);
  });

  it("defaults cooldown_minutes to 15 when not provided", () => {
    const result = CreateAlertRuleSchema.parse({
      name: "Slow pipeline",
      metric: "avg_duration_ms",
      operator: "gt",
      threshold: 60000,
    });

    expect(result.cooldown_minutes).toBe(15);
  });

  it("defaults severity to warning when not provided", () => {
    const result = CreateAlertRuleSchema.parse({
      name: "Health degraded",
      metric: "deployment_health",
      operator: "lt",
      threshold: 1,
    });

    expect(result.severity).toBe("warning");
  });
});

describe("UpdateAlertRuleSchema", () => {
  it("accepts partial fields", () => {
    const result = UpdateAlertRuleSchema.parse({ name: "Renamed alert" });

    expect(result.name).toBe("Renamed alert");
    expect(result.metric).toBeUndefined();
    expect(result.operator).toBeUndefined();
    expect(result.threshold).toBeUndefined();
  });
});
