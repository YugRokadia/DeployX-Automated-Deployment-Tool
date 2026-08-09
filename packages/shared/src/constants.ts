export const RUNNER_POLL_INTERVAL_MS = 5_000;
export const LOG_BATCH_INTERVAL_MS = 500;
export const LOG_BATCH_MAX_LINES = 50;
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const HEARTBEAT_TIMEOUT_MS = 60_000;
export const MAX_RESTART_ATTEMPTS = 3;
export const RESTART_BACKOFF_BASE_MS = 5_000;
export const HEALTH_CHECK_WINDOW_SIZE = 10;
export const HEALTH_THRESHOLD_HEALTHY = 0.8;
export const HEALTH_THRESHOLD_DEGRADED = 0.5;
export const HEALTH_MONITOR_INTERVAL_MS = 15_000;
export const HEALTH_MONITOR_PROBE_TIMEOUT_MS = 5_000;

// ── Pipeline Run State Transitions ──────────────────────────────
import type { PipelineRunStatus, TaskRunStatus, StepRunStatus } from "./types/enums";

export const VALID_PIPELINE_RUN_TRANSITIONS: Readonly<
  Record<PipelineRunStatus, readonly PipelineRunStatus[]>
> = {
  created: ["queued"],
  queued: ["running", "cancelled"],
  running: ["success", "failed", "cancelled", "timed_out"],
  success: [],
  failed: [],
  cancelled: [],
  timed_out: [],
} as const;

export const PIPELINE_RUN_TERMINAL_STATES: readonly PipelineRunStatus[] = [
  "success",
  "failed",
  "cancelled",
  "timed_out",
] as const;

// ── Task Run State Transitions ──────────────────────────────────

export const VALID_TASK_RUN_TRANSITIONS: Readonly<
  Record<TaskRunStatus, readonly TaskRunStatus[]>
> = {
  pending: ["running", "cancelled", "skipped"],
  running: ["success", "failed", "cancelled"],
  awaiting_approval: ["running", "cancelled"],
  success: [],
  failed: [],
  cancelled: [],
  skipped: [],
} as const;

export const TASK_RUN_TERMINAL_STATES: readonly TaskRunStatus[] = [
  "success",
  "failed",
  "cancelled",
  "skipped",
] as const;

// ── Step Run State Transitions ──────────────────────────────────

export const VALID_STEP_RUN_TRANSITIONS: Readonly<
  Record<StepRunStatus, readonly StepRunStatus[]>
> = {
  pending: ["running", "cancelled", "skipped"],
  running: ["success", "failed", "cancelled"],
  success: [],
  failed: [],
  cancelled: [],
  skipped: [],
} as const;

export const STEP_RUN_TERMINAL_STATES: readonly StepRunStatus[] = [
  "success",
  "failed",
  "cancelled",
  "skipped",
] as const;

// ── Deployment State Transitions ────────────────────────────────
import type { DeploymentStatus } from "./types/enums";

export const VALID_DEPLOYMENT_TRANSITIONS: Readonly<
  Record<DeploymentStatus, readonly DeploymentStatus[]>
> = {
  pending: ["deploying", "failed"],
  deploying: ["active", "failed"],
  active: ["draining", "stopped", "rolled_back"],
  draining: ["stopped", "rolled_back"],
  stopped: [],
  rolled_back: [],
  failed: [],
} as const;

export const DEPLOYMENT_TERMINAL_STATES: readonly DeploymentStatus[] = [
  "stopped",
  "rolled_back",
  "failed",
] as const;

// ── Deployer Constants ──────────────────────────────────────────

export const DEPLOYER_NETWORK_NAME = "deployx-net";
export const DEPLOYER_PORT_RANGE_START = 10000;
export const DEPLOYER_PORT_RANGE_END = 10999;
export const BLUE_GREEN_DRAIN_SECONDS = 10;

// ── Canary Deployment Constants ─────────────────────────────────
export const CANARY_DEFAULT_STAGES = [10, 25, 50, 100] as const;
export const CANARY_OBSERVATION_SECONDS = 30;
export const CANARY_DRAIN_SECONDS = 5;

// ── Rolling Deployment Constants ────────────────────────────────
export const ROLLING_DEFAULT_INSTANCES = 2;
export const ROLLING_MAX_UNAVAILABLE = 1;
export const ROLLING_OBSERVATION_SECONDS = 15;

// ── SLA / Uptime Constants ─────────────────────────────────────
export const SLA_DEFAULT_WINDOW_HOURS = 24;
export const SLA_UPTIME_TARGET_PERCENT = 99.9;

// ── Build Prediction Constants ─────────────────────────────────
export const BUILD_PREDICTION_EMA_ALPHA = 0.3;
export const BUILD_PREDICTION_MIN_SAMPLES = 5;
export const FAILURE_RISK_LOOKBACK_COUNT = 20;
export const FAILURE_RISK_HIGH_THRESHOLD = 0.6;
export const FAILURE_RISK_MEDIUM_THRESHOLD = 0.3;

// ── Alert Constants ────────────────────────────────────────────
export const ALERT_COOLDOWN_DEFAULT_MINUTES = 15;
export const ALERT_METRICS = [
  "success_rate",
  "avg_duration_ms",
  "health_check_failure_rate",
  "deployment_health",
] as const;
export const ALERT_OPERATORS = ["gt", "lt", "gte", "lte", "eq"] as const;

// ── Notification Constants ─────────────────────────────────────
export const NOTIFICATION_PAGE_SIZE = 20;

// ── Artifact Constants ─────────────────────────────────────────
export const ARTIFACT_MAX_SIZE_BYTES = 50 * 1024 * 1024;
export const ARTIFACT_ALLOWED_EXTENSIONS = [
  ".tar.gz",
  ".zip",
  ".jar",
  ".whl",
  ".deb",
  ".rpm",
  ".log",
] as const;
