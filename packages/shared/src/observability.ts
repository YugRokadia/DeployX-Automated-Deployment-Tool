import {
  BUILD_PREDICTION_EMA_ALPHA,
  BUILD_PREDICTION_MIN_SAMPLES,
  FAILURE_RISK_LOOKBACK_COUNT,
  FAILURE_RISK_HIGH_THRESHOLD,
  FAILURE_RISK_MEDIUM_THRESHOLD,
} from "./constants";

// ── SLA / Uptime ──────────────────────────────────────────────

export function computeUptimePercent(
  checks: ReadonlyArray<{ readonly status: string; readonly checked_at: string }>,
  windowHours: number,
): number {
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const inWindow = checks.filter(
    (c) => new Date(c.checked_at).getTime() >= cutoff,
  );
  if (inWindow.length === 0) return 100;
  const passCount = inWindow.filter((c) => c.status === "pass").length;
  return (passCount / inWindow.length) * 100;
}

export type SlaStatus = "met" | "at_risk" | "breached";

export function computeSlaStatus(
  uptimePercent: number,
  target: number,
): SlaStatus {
  if (uptimePercent >= target) return "met";
  if (uptimePercent >= target - 0.5) return "at_risk";
  return "breached";
}

// ── Build Duration Prediction (EMA) ───────────────────────────

export function predictBuildDuration(
  durations: readonly number[],
  alpha: number = BUILD_PREDICTION_EMA_ALPHA,
): number | null {
  if (durations.length < BUILD_PREDICTION_MIN_SAMPLES) return null;
  let ema = durations[0]!;
  for (let i = 1; i < durations.length; i++) {
    ema = alpha * durations[i]! + (1 - alpha) * ema;
  }
  return Math.round(ema);
}

// ── Failure Risk ──────────────────────────────────────────────

export interface FailureRiskResult {
  readonly risk: number;
  readonly level: "low" | "medium" | "high";
}

export function computeFailureRisk(
  runs: ReadonlyArray<{
    readonly status: string;
    readonly git_branch?: string | null;
  }>,
  branch?: string,
): FailureRiskResult {
  const filtered = branch
    ? runs.filter((r) => r.git_branch === branch)
    : runs;
  const recent = filtered.slice(-FAILURE_RISK_LOOKBACK_COUNT);
  if (recent.length === 0) return { risk: 0, level: "low" };

  const failCount = recent.filter((r) => r.status === "failed").length;
  const risk = failCount / recent.length;

  let level: "low" | "medium" | "high";
  if (risk >= FAILURE_RISK_HIGH_THRESHOLD) {
    level = "high";
  } else if (risk >= FAILURE_RISK_MEDIUM_THRESHOLD) {
    level = "medium";
  } else {
    level = "low";
  }

  return { risk, level };
}

// ── Alert Evaluation ──────────────────────────────────────────

export function evaluateAlertCondition(
  currentValue: number,
  operator: string,
  threshold: number,
): boolean {
  switch (operator) {
    case "gt":
      return currentValue > threshold;
    case "lt":
      return currentValue < threshold;
    case "gte":
      return currentValue >= threshold;
    case "lte":
      return currentValue <= threshold;
    case "eq":
      return currentValue === threshold;
    default:
      return false;
  }
}

// ── Formatting ────────────────────────────────────────────────

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}
