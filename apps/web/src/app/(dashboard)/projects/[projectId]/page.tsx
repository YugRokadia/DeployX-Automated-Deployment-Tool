import { notFound } from "next/navigation";
import { requireUserWithOrg } from "@/lib/auth/session";
import { ProjectDetailClient } from "./project-detail-client";
import {
  computeUptimePercent,
  computeSlaStatus,
  predictBuildDuration,
  computeFailureRisk,
  SLA_DEFAULT_WINDOW_HOURS,
  SLA_UPTIME_TARGET_PERCENT,
} from "@deployx/shared";

interface PageProps {
  readonly params: Promise<{ projectId: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { projectId } = await params;
  const { supabase } = await requireUserWithOrg();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug, git_repo_url, default_branch, dockerfile_path, build_context, deploy_target, created_at")
    .eq("id", projectId)
    .single();

  if (!project) {
    notFound();
  }

  // Fetch pipeline definitions for this project
  const { data: definitions } = await supabase
    .from("pipeline_definitions")
    .select("id, name, current_version_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  // Fetch pipeline runs for this project
  const { data: pipelineRuns } = await supabase
    .from("pipeline_runs")
    .select("id, status, trigger_type, git_branch, git_sha, duration_ms, created_at, created_by, pipeline_definition_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Fetch deployments for this project
  const { data: deployments } = await supabase
    .from("deployments")
    .select("id, status, strategy, deploy_target, health_status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Compute metrics from pipeline runs (last 100 for accuracy)
  const { data: metricsRuns } = await supabase
    .from("pipeline_runs")
    .select("status, duration_ms")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100);

  const allRuns = metricsRuns ?? [];
  const totalRuns = allRuns.length;
  const successfulRuns = allRuns.filter((r) => r.status === "success").length;
  const successDurations = allRuns
    .filter((r) => r.status === "success" && r.duration_ms != null)
    .map((r) => r.duration_ms as number)
    .sort((a, b) => a - b);

  const metrics = {
    successRate: totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : null,
    avgDurationMs: successDurations.length > 0
      ? Math.round(successDurations.reduce((a, b) => a + b, 0) / successDurations.length)
      : null,
    p95DurationMs: successDurations.length > 0
      ? successDurations[Math.floor(successDurations.length * 0.95)] ?? null
      : null,
    activeRunners: 0,
  };

  // Count active runners
  const { count: runnerCount } = await supabase
    .from("runner_registrations")
    .select("id", { count: "exact", head: true })
    .eq("status", "online");

  metrics.activeRunners = runnerCount ?? 0;

  // Fetch project secrets (metadata only — never return encrypted values to client)
  const { data: secrets } = await supabase
    .from("project_secrets")
    .select("id, key, is_secret, created_at, updated_at")
    .eq("project_id", projectId)
    .order("key", { ascending: true });

  // Fetch webhook configuration (one per project in v1)
  const { data: webhookConfig } = await supabase
    .from("webhook_configs")
    .select("id, pipeline_definition_id, branch_filter, is_active, last_triggered_at, created_at")
    .eq("project_id", projectId)
    .single();

  // Fetch pipeline schedules
  const { data: pipelineSchedules } = await supabase
    .from("pipeline_schedules")
    .select("id, pipeline_definition_id, cron_expression, timezone, git_branch, is_active, next_run_at, last_run_at, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  // Fetch recent webhook deliveries (if config exists)
  const webhookDeliveries = webhookConfig
    ? (await supabase
        .from("webhook_deliveries")
        .select("id, event_type, payload_ref, status, status_message, pipeline_run_id, created_at")
        .eq("webhook_config_id", webhookConfig.id)
        .order("created_at", { ascending: false })
        .limit(10)
      ).data ?? []
    : [];

  // ── SLA / Uptime data ──────────────────────────────────────
  const deploymentIds = (deployments ?? []).map((d) => d.id as string);
  let healthChecks: Array<{ status: string; checked_at: string }> = [];
  if (deploymentIds.length > 0) {
    const { data: checks } = await supabase
      .from("health_check_results")
      .select("status, checked_at")
      .in("deployment_id", deploymentIds)
      .order("checked_at", { ascending: false })
      .limit(500);
    healthChecks = (checks ?? []) as Array<{ status: string; checked_at: string }>;
  }

  const uptimePercent = computeUptimePercent(healthChecks, SLA_DEFAULT_WINDOW_HOURS);
  const slaStatus = computeSlaStatus(uptimePercent, SLA_UPTIME_TARGET_PERCENT);

  // ── Predictive features ────────────────────────────────────
  const predictedDuration = predictBuildDuration(successDurations);
  const failureRisk = computeFailureRisk(
    allRuns.map((r) => ({ status: r.status as string })),
  );

  return (
    <ProjectDetailClient
      project={project}
      pipelineDefinitions={definitions ?? []}
      pipelineRuns={pipelineRuns ?? []}
      deployments={deployments ?? []}
      metrics={metrics}
      secrets={secrets ?? []}
      webhookConfig={webhookConfig}
      webhookDeliveries={webhookDeliveries}
      schedules={pipelineSchedules ?? []}
      slaData={{
        uptimePercent,
        slaStatus,
        healthChecks: healthChecks.slice(0, 100),
      }}
      predictedDuration={predictedDuration}
      failureRisk={failureRisk}
    />
  );
}
