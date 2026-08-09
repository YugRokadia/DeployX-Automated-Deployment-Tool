import type {
  OrgRole,
  PipelineRunStatus,
  TaskRunStatus,
  StepRunStatus,
  DeploymentStatus,
  DeploymentStrategy,
  HealthStatus,
  RunnerStatus,
  LogLevel,
  DeployTarget,
  HealingEventType,
  AlertSeverity,
  NotificationType,
  AuditAction,
} from "./enums";

export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface OrgMembership {
  readonly id: string;
  readonly org_id: string;
  readonly user_id: string;
  readonly role: OrgRole;
  readonly created_at: string;
}

export interface UserProfile {
  readonly id: string;
  readonly display_name: string;
  readonly avatar_url: string | null;
  readonly github_username: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Project {
  readonly id: string;
  readonly org_id: string;
  readonly name: string;
  readonly slug: string;
  readonly git_repo_url: string;
  readonly default_branch: string;
  readonly dockerfile_path: string;
  readonly build_context: string;
  readonly deploy_target: DeployTarget;
  readonly github_token_id: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PipelineDefinition {
  readonly id: string;
  readonly project_id: string;
  readonly name: string;
  readonly current_version_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PipelineDefinitionVersion {
  readonly id: string;
  readonly pipeline_definition_id: string;
  readonly version: number;
  readonly config_json: Record<string, unknown>;
  readonly created_by: string;
  readonly created_at: string;
}

export interface PipelineRun {
  readonly id: string;
  readonly pipeline_definition_id: string;
  readonly pipeline_version_id: string;
  readonly project_id: string;
  readonly status: PipelineRunStatus;
  readonly trigger_type: "manual" | "webhook" | "schedule";
  readonly trigger_ref: string | null;
  readonly git_branch: string | null;
  readonly git_sha: string | null;
  readonly runner_id: string | null;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly duration_ms: number | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface TaskRun {
  readonly id: string;
  readonly pipeline_run_id: string;
  readonly task_name: string;
  readonly status: TaskRunStatus;
  readonly sort_order: number;
  readonly depends_on: readonly string[];
  readonly approval_required: boolean;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly duration_ms: number | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface StepRun {
  readonly id: string;
  readonly task_run_id: string;
  readonly step_name: string;
  readonly status: StepRunStatus;
  readonly sort_order: number;
  readonly command: string | null;
  readonly exit_code: number | null;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly duration_ms: number | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Deployment {
  readonly id: string;
  readonly project_id: string;
  readonly pipeline_run_id: string | null;
  readonly status: DeploymentStatus;
  readonly strategy: DeploymentStrategy;
  readonly deploy_target: DeployTarget;
  readonly current_revision_id: string | null;
  readonly health_status: HealthStatus;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface DeploymentRevision {
  readonly id: string;
  readonly deployment_id: string;
  readonly revision_number: number;
  readonly image_tag: string;
  readonly image_digest: string | null;
  readonly status: DeploymentStatus;
  readonly rollback_reason: string | null;
  readonly created_at: string;
}

export interface RunLog {
  readonly id: string;
  readonly pipeline_run_id: string;
  readonly task_run_id: string | null;
  readonly step_run_id: string | null;
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly metadata: Record<string, unknown> | null;
}

export interface RunnerRegistration {
  readonly id: string;
  readonly org_id: string;
  readonly name: string;
  readonly token_hash: string;
  readonly status: RunnerStatus;
  readonly current_job_id: string | null;
  readonly last_heartbeat_at: string | null;
  readonly system_info: {
    readonly os: string;
    readonly arch: string;
    readonly version: string;
  } | null;
  readonly capabilities: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ContainerImage {
  readonly id: string;
  readonly project_id: string;
  readonly pipeline_run_id: string | null;
  readonly registry: string;
  readonly repository: string;
  readonly tag: string;
  readonly digest: string | null;
  readonly size_bytes: number | null;
  readonly created_at: string;
}

export interface HealthCheckResult {
  readonly id: string;
  readonly deployment_id: string;
  readonly status: "pass" | "fail";
  readonly response_time_ms: number | null;
  readonly status_code: number | null;
  readonly error_message: string | null;
  readonly checked_at: string;
}

export interface HealingEvent {
  readonly id: string;
  readonly deployment_id: string;
  readonly event_type: HealingEventType;
  readonly attempt_number: number | null;
  readonly container_name: string | null;
  readonly details: Record<string, unknown> | null;
  readonly created_at: string;
}

export interface DeploymentApproval {
  readonly id: string;
  readonly task_run_id: string;
  readonly required_approvals: number;
  readonly status: "pending" | "approved" | "rejected";
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ApprovalVote {
  readonly id: string;
  readonly approval_id: string;
  readonly user_id: string;
  readonly decision: "approve" | "reject";
  readonly comment: string | null;
  readonly created_at: string;
}

export interface ProjectSecret {
  readonly id: string;
  readonly project_id: string;
  readonly key: string;
  readonly encrypted_value: string;
  readonly is_secret: boolean;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface OrgInvite {
  readonly id: string;
  readonly org_id: string;
  readonly email: string;
  readonly role: OrgRole;
  readonly invited_by: string;
  readonly accepted_at: string | null;
  readonly expires_at: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ProjectPermission {
  readonly id: string;
  readonly project_id: string;
  readonly user_id: string;
  readonly can_trigger_pipeline: boolean;
  readonly can_approve_deploy: boolean;
  readonly can_rollback: boolean;
  readonly can_edit_pipeline: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PipelineSchedule {
  readonly id: string;
  readonly project_id: string;
  readonly pipeline_definition_id: string;
  readonly cron_expression: string;
  readonly timezone: string;
  readonly git_branch: string | null;
  readonly is_active: boolean;
  readonly next_run_at: string | null;
  readonly last_run_at: string | null;
  readonly last_run_id: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface WebhookConfig {
  readonly id: string;
  readonly project_id: string;
  readonly pipeline_definition_id: string | null;
  readonly secret_encrypted: string;
  readonly branch_filter: string | null;
  readonly events: readonly string[];
  readonly is_active: boolean;
  readonly last_triggered_at: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface WebhookDelivery {
  readonly id: string;
  readonly webhook_config_id: string;
  readonly event_type: string;
  readonly payload_ref: string | null;
  readonly status: string;
  readonly status_message: string | null;
  readonly pipeline_run_id: string | null;
  readonly created_at: string;
}

export interface AlertRule {
  readonly id: string;
  readonly org_id: string;
  readonly project_id: string | null;
  readonly name: string;
  readonly metric: string;
  readonly operator: string;
  readonly threshold: number;
  readonly severity: AlertSeverity;
  readonly is_active: boolean;
  readonly cooldown_minutes: number;
  readonly last_triggered_at: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Notification {
  readonly id: string;
  readonly org_id: string;
  readonly user_id: string | null;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly metadata: Record<string, unknown> | null;
  readonly is_read: boolean;
  readonly created_at: string;
}

export interface AuditEvent {
  readonly id: string;
  readonly org_id: string;
  readonly user_id: string;
  readonly action: AuditAction;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly details: Record<string, unknown> | null;
  readonly ip_address: string | null;
  readonly created_at: string;
}

export interface GitHubToken {
  readonly id: string;
  readonly user_id: string;
  readonly encrypted_token: string;
  readonly scopes: string;
  readonly created_at: string;
  readonly updated_at: string;
}
