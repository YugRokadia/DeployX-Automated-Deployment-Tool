import { notFound } from "next/navigation";
import { requireUserWithOrg } from "@/lib/auth/session";
import { DeploymentDetailClient } from "./deployment-detail-client";

interface PageProps {
  readonly params: Promise<{ projectId: string; deploymentId: string }>;
}

export default async function DeploymentDetailPage({ params }: PageProps) {
  const { projectId, deploymentId } = await params;
  const { supabase } = await requireUserWithOrg();

  // Fetch project
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  // Fetch deployment
  const { data: deployment } = await supabase
    .from("deployments")
    .select("id, project_id, pipeline_run_id, status, strategy, deploy_target, current_revision_id, health_status, created_by, created_at, updated_at")
    .eq("id", deploymentId)
    .eq("project_id", projectId)
    .single();

  if (!deployment) notFound();

  // Fetch revisions
  const { data: revisions } = await supabase
    .from("deployment_revisions")
    .select("id, deployment_id, revision_number, image_tag, image_digest, status, rollback_reason, created_at")
    .eq("deployment_id", deploymentId)
    .order("revision_number", { ascending: false });

  // Fetch recent health checks
  const { data: healthChecks } = await supabase
    .from("health_check_results")
    .select("id, status, response_time_ms, status_code, error_message, checked_at")
    .eq("deployment_id", deploymentId)
    .order("checked_at", { ascending: false })
    .limit(50);

  // Fetch healing events
  const { data: healingEvents } = await supabase
    .from("healing_events")
    .select("id, event_type, attempt_number, container_name, details, created_at")
    .eq("deployment_id", deploymentId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Fetch approval data if this deployment has a pipeline run
  let approval: { id: string; status: string; required_approvals: number } | null = null;
  let approvalVotes: { id: string; user_id: string; decision: string; comment: string | null; created_at: string }[] = [];

  if (deployment.pipeline_run_id) {
    // Find task runs for this pipeline run that have approvals
    const { data: taskRuns } = await supabase
      .from("task_runs")
      .select("id")
      .eq("pipeline_run_id", deployment.pipeline_run_id);

    if (taskRuns && taskRuns.length > 0) {
      const taskRunIds = taskRuns.map((tr: { id: string }) => tr.id);
      const { data: approvalData } = await supabase
        .from("deployment_approvals")
        .select("id, status, required_approvals")
        .in("task_run_id", taskRunIds)
        .limit(1)
        .maybeSingle();

      if (approvalData) {
        approval = approvalData;
        const { data: votes } = await supabase
          .from("approval_votes")
          .select("id, user_id, decision, comment, created_at")
          .eq("approval_id", approvalData.id)
          .order("created_at", { ascending: true });
        approvalVotes = votes ?? [];
      }
    }
  }

  return (
    <DeploymentDetailClient
      project={project}
      deployment={deployment}
      revisions={revisions ?? []}
      healthChecks={healthChecks ?? []}
      healingEvents={healingEvents ?? []}
      approval={approval}
      approvalVotes={approvalVotes}
    />
  );
}
