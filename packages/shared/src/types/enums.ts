export const OrgRole = {
  OWNER: "owner",
  ADMIN: "admin",
  DEVELOPER: "developer",
  VIEWER: "viewer",
} as const;
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

export const PipelineRunStatus = {
  CREATED: "created",
  QUEUED: "queued",
  RUNNING: "running",
  SUCCESS: "success",
  FAILED: "failed",
  CANCELLED: "cancelled",
  TIMED_OUT: "timed_out",
} as const;
export type PipelineRunStatus =
  (typeof PipelineRunStatus)[keyof typeof PipelineRunStatus];

export const TaskRunStatus = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCESS: "success",
  FAILED: "failed",
  CANCELLED: "cancelled",
  SKIPPED: "skipped",
  AWAITING_APPROVAL: "awaiting_approval",
} as const;
export type TaskRunStatus =
  (typeof TaskRunStatus)[keyof typeof TaskRunStatus];

export const StepRunStatus = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCESS: "success",
  FAILED: "failed",
  CANCELLED: "cancelled",
  SKIPPED: "skipped",
} as const;
export type StepRunStatus =
  (typeof StepRunStatus)[keyof typeof StepRunStatus];

export const DeploymentStatus = {
  PENDING: "pending",
  DEPLOYING: "deploying",
  ACTIVE: "active",
  DRAINING: "draining",
  STOPPED: "stopped",
  ROLLED_BACK: "rolled_back",
  FAILED: "failed",
} as const;
export type DeploymentStatus =
  (typeof DeploymentStatus)[keyof typeof DeploymentStatus];

export const DeploymentStrategy = {
  BLUE_GREEN: "blue_green",
  CANARY: "canary",
  ROLLING: "rolling",
} as const;
export type DeploymentStrategy =
  (typeof DeploymentStrategy)[keyof typeof DeploymentStrategy];

export const HealthStatus = {
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNHEALTHY: "unhealthy",
  UNKNOWN: "unknown",
} as const;
export type HealthStatus =
  (typeof HealthStatus)[keyof typeof HealthStatus];

export const RunnerStatus = {
  ONLINE: "online",
  OFFLINE: "offline",
  BUSY: "busy",
} as const;
export type RunnerStatus =
  (typeof RunnerStatus)[keyof typeof RunnerStatus];

export const LogLevel = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const HealingEventType = {
  HEALTH_DEGRADED: "health_degraded",
  HEALTH_UNHEALTHY: "health_unhealthy",
  RESTART_STARTED: "restart_started",
  RESTART_SUCCEEDED: "restart_succeeded",
  RESTART_FAILED: "restart_failed",
  ROLLBACK_STARTED: "rollback_started",
  ROLLBACK_SUCCEEDED: "rollback_succeeded",
  ROLLBACK_FAILED: "rollback_failed",
  CANARY_PROMOTION: "canary_promotion",
  CANARY_ROLLBACK: "canary_rollback",
  ROLLING_INSTANCE_UPDATED: "rolling_instance_updated",
  ROLLING_ROLLBACK: "rolling_rollback",
} as const;
export type HealingEventType =
  (typeof HealingEventType)[keyof typeof HealingEventType];

export const DeployTarget = {
  DOCKER_LOCAL: "docker_local",
  RAILWAY: "railway",
  FLY_IO: "fly_io",
} as const;
export type DeployTarget =
  (typeof DeployTarget)[keyof typeof DeployTarget];

export const AlertSeverity = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
} as const;
export type AlertSeverity =
  (typeof AlertSeverity)[keyof typeof AlertSeverity];

export const NotificationType = {
  ALERT_FIRED: "alert_fired",
  DEPLOYMENT_STATUS: "deployment_status",
  PIPELINE_STATUS: "pipeline_status",
  APPROVAL_REQUESTED: "approval_requested",
  SYSTEM: "system",
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export const AuditAction = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  TRIGGER: "trigger",
  APPROVE: "approve",
  REJECT: "reject",
  ROLLBACK: "rollback",
  LOGIN: "login",
} as const;
export type AuditAction =
  (typeof AuditAction)[keyof typeof AuditAction];
