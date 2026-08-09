import { describe, it, expect } from "vitest";
import {
  parseCronExpression,
  getNextCronRun,
  describeCron,
  CreateScheduleSchema,
  UpdateScheduleSchema,
  CRON_PRESETS,
} from "../schedule";

describe("parseCronExpression", () => {
  it("parses '* * * * *' (every minute)", () => {
    const parts = parseCronExpression("* * * * *");
    expect(parts.minute).toHaveLength(60);
    expect(parts.hour).toHaveLength(24);
    expect(parts.dayOfMonth).toHaveLength(31);
    expect(parts.month).toHaveLength(12);
    expect(parts.dayOfWeek).toHaveLength(7);
  });

  it("parses '0 0 * * *' (daily at midnight)", () => {
    const parts = parseCronExpression("0 0 * * *");
    expect(parts.minute).toEqual([0]);
    expect(parts.hour).toEqual([0]);
  });

  it("parses '*/15 * * * *' (every 15 minutes)", () => {
    const parts = parseCronExpression("*/15 * * * *");
    expect(parts.minute).toEqual([0, 15, 30, 45]);
  });

  it("parses '0 9-17 * * 1-5' (hourly 9-5 weekdays)", () => {
    const parts = parseCronExpression("0 9-17 * * 1-5");
    expect(parts.minute).toEqual([0]);
    expect(parts.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(parts.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it("parses comma-separated values '0,30 * * * *'", () => {
    const parts = parseCronExpression("0,30 * * * *");
    expect(parts.minute).toEqual([0, 30]);
  });

  it("parses step with range '1-10/3 * * * *'", () => {
    const parts = parseCronExpression("1-10/3 * * * *");
    expect(parts.minute).toEqual([1, 4, 7, 10]);
  });

  it("parses '0 */6 * * *' (every 6 hours)", () => {
    const parts = parseCronExpression("0 */6 * * *");
    expect(parts.hour).toEqual([0, 6, 12, 18]);
  });

  it("throws on too few fields", () => {
    expect(() => parseCronExpression("* * *")).toThrow("must have exactly 5 fields");
  });

  it("throws on too many fields", () => {
    expect(() => parseCronExpression("* * * * * *")).toThrow("must have exactly 5 fields");
  });

  it("throws on out-of-range minute", () => {
    expect(() => parseCronExpression("60 * * * *")).toThrow();
  });

  it("throws on out-of-range hour", () => {
    expect(() => parseCronExpression("0 25 * * *")).toThrow();
  });

  it("throws on out-of-range day of month", () => {
    expect(() => parseCronExpression("0 0 32 * *")).toThrow();
  });

  it("throws on out-of-range month", () => {
    expect(() => parseCronExpression("0 0 * 13 *")).toThrow();
  });

  it("throws on out-of-range day of week", () => {
    expect(() => parseCronExpression("0 0 * * 7")).toThrow();
  });

  it("throws on invalid range (start > end)", () => {
    expect(() => parseCronExpression("30-10 * * * *")).toThrow();
  });

  it("throws on invalid step value", () => {
    expect(() => parseCronExpression("*/0 * * * *")).toThrow();
  });
});

describe("getNextCronRun", () => {
  it("computes next run for '0 * * * *' (hourly)", () => {
    const after = new Date("2025-04-06T10:30:00Z");
    const next = getNextCronRun("0 * * * *", after);
    expect(next.toISOString()).toBe("2025-04-06T11:00:00.000Z");
  });

  it("computes next run for '0 0 * * *' (daily at midnight)", () => {
    const after = new Date("2025-04-06T23:59:00Z");
    const next = getNextCronRun("0 0 * * *", after);
    expect(next.toISOString()).toBe("2025-04-07T00:00:00.000Z");
  });

  it("computes next run for '30 14 * * *' (2:30 PM daily)", () => {
    const after = new Date("2025-04-06T10:00:00Z");
    const next = getNextCronRun("30 14 * * *", after);
    expect(next.toISOString()).toBe("2025-04-06T14:30:00.000Z");
  });

  it("skips to next day if time already passed", () => {
    const after = new Date("2025-04-06T15:00:00Z");
    const next = getNextCronRun("30 14 * * *", after);
    expect(next.toISOString()).toBe("2025-04-07T14:30:00.000Z");
  });

  it("handles day-of-week filter (Monday = 1)", () => {
    // 2025-04-06 is a Sunday
    const after = new Date("2025-04-06T00:00:00Z");
    const next = getNextCronRun("0 0 * * 1", after);
    expect(next.toISOString()).toBe("2025-04-07T00:00:00.000Z");
  });

  it("handles every-15-minutes", () => {
    const after = new Date("2025-04-06T10:07:00Z");
    const next = getNextCronRun("*/15 * * * *", after);
    expect(next.toISOString()).toBe("2025-04-06T10:15:00.000Z");
  });

  it("handles month boundary", () => {
    const after = new Date("2025-04-30T23:59:00Z");
    const next = getNextCronRun("0 0 1 * *", after);
    expect(next.toISOString()).toBe("2025-05-01T00:00:00.000Z");
  });

  it("starts from next minute, not current minute", () => {
    const after = new Date("2025-04-06T10:00:00Z");
    const next = getNextCronRun("0 10 * * *", after);
    // 10:00 is the current minute, so next run should be tomorrow
    expect(next.toISOString()).toBe("2025-04-07T10:00:00.000Z");
  });
});

describe("describeCron", () => {
  it("describes hourly preset", () => {
    expect(describeCron("0 * * * *")).toBe("Every hour at minute 0");
  });

  it("describes daily preset", () => {
    expect(describeCron("0 0 * * *")).toBe("Every day at midnight UTC");
  });

  it("describes weekly preset", () => {
    expect(describeCron("0 0 * * 1")).toBe("Every Monday at midnight UTC");
  });

  it("describes every-6h preset", () => {
    expect(describeCron("0 */6 * * *")).toBe("Every 6 hours at minute 0");
  });

  it("describes custom expression", () => {
    const result = describeCron("30 14 * * *");
    expect(result).toContain("30");
    expect(result).toContain("14");
  });

  it("returns raw expression on parse failure", () => {
    expect(describeCron("invalid")).toBe("invalid");
  });
});

describe("CRON_PRESETS", () => {
  it("all presets are valid cron expressions", () => {
    for (const [, expr] of Object.entries(CRON_PRESETS)) {
      expect(() => parseCronExpression(expr)).not.toThrow();
    }
  });
});

describe("CreateScheduleSchema", () => {
  const validInput = {
    pipeline_definition_id: "550e8400-e29b-41d4-a716-446655440000",
    cron_expression: "0 0 * * *",
  };

  it("accepts valid input", () => {
    const result = CreateScheduleSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts input with git_branch", () => {
    const result = CreateScheduleSchema.safeParse({
      ...validInput,
      git_branch: "main",
    });
    expect(result.success).toBe(true);
  });

  it("defaults timezone to UTC", () => {
    const result = CreateScheduleSchema.parse(validInput);
    expect(result.timezone).toBe("UTC");
  });

  it("rejects invalid UUID", () => {
    const result = CreateScheduleSchema.safeParse({
      ...validInput,
      pipeline_definition_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid cron expression", () => {
    const result = CreateScheduleSchema.safeParse({
      ...validInput,
      cron_expression: "not valid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty cron expression", () => {
    const result = CreateScheduleSchema.safeParse({
      ...validInput,
      cron_expression: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects overly long cron expression", () => {
    const result = CreateScheduleSchema.safeParse({
      ...validInput,
      cron_expression: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateScheduleSchema", () => {
  it("accepts empty input (all optional)", () => {
    expect(UpdateScheduleSchema.safeParse({}).success).toBe(true);
  });

  it("accepts valid cron expression update", () => {
    const result = UpdateScheduleSchema.safeParse({
      cron_expression: "*/30 * * * *",
    });
    expect(result.success).toBe(true);
  });

  it("accepts git_branch update", () => {
    const result = UpdateScheduleSchema.safeParse({
      git_branch: "develop",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null git_branch (clear)", () => {
    const result = UpdateScheduleSchema.safeParse({
      git_branch: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid cron expression", () => {
    const result = UpdateScheduleSchema.safeParse({
      cron_expression: "bad",
    });
    expect(result.success).toBe(false);
  });
});
