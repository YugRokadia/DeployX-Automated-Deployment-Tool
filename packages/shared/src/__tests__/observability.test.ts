import { describe, it, expect } from "vitest";
import {
  computeUptimePercent,
  computeSlaStatus,
  predictBuildDuration,
  computeFailureRisk,
  evaluateAlertCondition,
  formatDurationMs,
} from "../observability";

// ── Helpers ──────────────────────────────────────────────────────

function recentIso(minutesAgo: number): string {
  return new Date(Date.now() - 1000 * 60 * minutesAgo).toISOString();
}

function oldIso(hoursAgo: number): string {
  return new Date(Date.now() - 1000 * 60 * 60 * hoursAgo).toISOString();
}

function makeChecks(
  count: number,
  status: string,
  checkedAt: string,
): ReadonlyArray<{ readonly status: string; readonly checked_at: string }> {
  return Array.from({ length: count }, () => ({
    status,
    checked_at: checkedAt,
  }));
}

// ── computeUptimePercent ─────────────────────────────────────────

describe("computeUptimePercent", () => {
  it("returns 100 when all checks pass", () => {
    const checks = makeChecks(10, "pass", recentIso(5));
    expect(computeUptimePercent(checks, 24)).toBe(100);
  });

  it("returns 0 when all checks fail", () => {
    const checks = makeChecks(10, "fail", recentIso(5));
    expect(computeUptimePercent(checks, 24)).toBe(0);
  });

  it("calculates mixed correctly", () => {
    const passing = makeChecks(7, "pass", recentIso(5));
    const failing = makeChecks(3, "fail", recentIso(5));
    const checks = [...passing, ...failing];
    expect(computeUptimePercent(checks, 24)).toBe(70);
  });

  it("returns 100 when no checks in window", () => {
    const checks = makeChecks(10, "fail", oldIso(48));
    expect(computeUptimePercent(checks, 24)).toBe(100);
  });

  it("filters by window", () => {
    const oldFails = makeChecks(3, "fail", oldIso(48));
    const recentPasses = makeChecks(2, "pass", recentIso(5));
    const checks = [...oldFails, ...recentPasses];
    expect(computeUptimePercent(checks, 24)).toBe(100);
  });
});

// ── computeSlaStatus ─────────────────────────────────────────────

describe("computeSlaStatus", () => {
  it("returns met when uptime >= target", () => {
    expect(computeSlaStatus(99.95, 99.9)).toBe("met");
  });

  it("returns at_risk when within 0.5 of target", () => {
    expect(computeSlaStatus(99.5, 99.9)).toBe("at_risk");
  });

  it("returns breached when below target - 0.5", () => {
    expect(computeSlaStatus(99.0, 99.9)).toBe("breached");
  });
});

// ── predictBuildDuration ─────────────────────────────────────────

describe("predictBuildDuration", () => {
  it("returns EMA prediction with sufficient samples", () => {
    const durations = [10000, 12000, 11000, 13000, 10000];
    const result = predictBuildDuration(durations);

    expect(result).toBeTypeOf("number");
    expect(result).not.toBeNull();

    // Manually compute EMA with alpha=0.3:
    // ema0 = 10000
    // ema1 = 0.3 * 12000 + 0.7 * 10000 = 10600
    // ema2 = 0.3 * 11000 + 0.7 * 10600 = 10720
    // ema3 = 0.3 * 13000 + 0.7 * 10720 = 11404
    // ema4 = 0.3 * 10000 + 0.7 * 11404 = 10982.8 → rounded to 10983
    expect(result).toBe(10983);
  });

  it("returns null with insufficient samples", () => {
    const durations = [10000, 12000];
    expect(predictBuildDuration(durations)).toBeNull();
  });
});

// ── computeFailureRisk ───────────────────────────────────────────

describe("computeFailureRisk", () => {
  it("calculates risk level correctly", () => {
    // 10 successful + 5 failed = 15 runs, all within lookback of 20
    // risk = 5 / 15 = 0.333... → >= 0.3 medium threshold → "medium"
    const runs = [
      ...Array.from({ length: 10 }, () => ({ status: "success" })),
      ...Array.from({ length: 5 }, () => ({ status: "failed" })),
    ];

    const result = computeFailureRisk(runs);

    expect(result.risk).toBeCloseTo(5 / 15, 5);
    expect(result.level).toBe("medium");
  });
});

// ── evaluateAlertCondition ───────────────────────────────────────

describe("evaluateAlertCondition", () => {
  it("evaluates all operators correctly", () => {
    // gt
    expect(evaluateAlertCondition(10, "gt", 5)).toBe(true);
    expect(evaluateAlertCondition(5, "gt", 5)).toBe(false);
    expect(evaluateAlertCondition(3, "gt", 5)).toBe(false);

    // lt
    expect(evaluateAlertCondition(3, "lt", 5)).toBe(true);
    expect(evaluateAlertCondition(5, "lt", 5)).toBe(false);
    expect(evaluateAlertCondition(10, "lt", 5)).toBe(false);

    // gte
    expect(evaluateAlertCondition(10, "gte", 5)).toBe(true);
    expect(evaluateAlertCondition(5, "gte", 5)).toBe(true);
    expect(evaluateAlertCondition(3, "gte", 5)).toBe(false);

    // lte
    expect(evaluateAlertCondition(3, "lte", 5)).toBe(true);
    expect(evaluateAlertCondition(5, "lte", 5)).toBe(true);
    expect(evaluateAlertCondition(10, "lte", 5)).toBe(false);

    // eq
    expect(evaluateAlertCondition(5, "eq", 5)).toBe(true);
    expect(evaluateAlertCondition(4, "eq", 5)).toBe(false);
  });
});
