import { notFound } from "next/navigation";
import { requireUserWithOrg } from "@/lib/auth/session";
import { RunDetailClient } from "./run-detail-client";

interface PageProps {
  readonly params: Promise<{ projectId: string; runId: string }>;
}

export default async function PipelineRunDetailPage({ params }: PageProps) {
  const { projectId, runId } = await params;
  const { supabase } = await requireUserWithOrg();

  // Fetch the pipeline run
  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("id, status, trigger_type, git_branch, git_sha, duration_ms, created_at, started_at, finished_at, pipeline_definition_id")
    .eq("id", runId)
    .eq("project_id", projectId)
    .single();

  if (!run) notFound();

  // Fetch project name for breadcrumbs
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  // Fetch pipeline definition name
  const { data: definition } = await supabase
    .from("pipeline_definitions")
    .select("name")
    .eq("id", run.pipeline_definition_id)
    .single();

  // Fetch task runs for this pipeline run
  const { data: taskRuns } = await supabase
    .from("task_runs")
    .select("id, task_name, status, started_at, finished_at, duration_ms, depends_on")
    .eq("pipeline_run_id", runId)
    .order("started_at", { ascending: true, nullsFirst: false });

  // Fetch step runs for all tasks
  const taskRunIds = (taskRuns ?? []).map((t) => t.id);
  const { data: stepRuns } = taskRunIds.length > 0
    ? await supabase
        .from("step_runs")
        .select("id, task_run_id, step_name, status, started_at, finished_at, duration_ms, exit_code")
        .in("task_run_id", taskRunIds)
        .order("started_at", { ascending: true, nullsFirst: false })
    : { data: [] };

  // Fetch recent logs
  const { data: logs } = await supabase
    .from("run_logs")
    .select("id, task_run_id, step_run_id, level, message, timestamp")
    .eq("pipeline_run_id", runId)
    .order("timestamp", { ascending: true })
    .limit(500);

  return (
    <RunDetailClient
      project={project}
      run={run}
      definitionName={definition?.name ?? "Unknown"}
      taskRuns={taskRuns ?? []}
      stepRuns={stepRuns ?? []}
      logs={logs ?? []}
    />
  );
}
