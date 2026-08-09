import { NextResponse } from "next/server";
import { authenticateRunner } from "@/lib/auth/runner";

interface RouteParams {
  readonly params: Promise<{ runId: string }>;
}

/**
 * POST /api/runner/jobs/[runId]/claim
 *
 * Atomically claims a queued pipeline run for the authenticated runner.
 * Uses a WHERE status='queued' guard to prevent race conditions —
 * only one runner can successfully claim a given run.
 *
 * After claiming, expands config_json into task_run and step_run records.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { runId } = await params;
  const auth = await authenticateRunner(request);
  if (!auth.ok) return auth.response;

  const { runner, supabase } = auth;

  // Atomic claim: only succeeds if status is still 'queued'
  const { data: claimed, error: claimError } = await supabase
    .from("pipeline_runs")
    .update({
      status: "running",
      runner_id: runner.id,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("status", "queued")
    .select(`
      id,
      project_id,
      pipeline_version_id,
      git_branch,
      git_sha,
      pipeline_definition_versions!pipeline_runs_pipeline_version_id_fkey (
        config_json
      )
    `)
    .maybeSingle();

  if (claimError) {
    return NextResponse.json(
      { error: "Failed to claim job" },
      { status: 500 },
    );
  }

  if (!claimed) {
    return NextResponse.json(
      { error: "Job already claimed or does not exist" },
      { status: 409 },
    );
  }

  // Mark runner as busy
  await supabase
    .from("runner_registrations")
    .update({
      current_job_id: runId,
      status: "busy",
    })
    .eq("id", runner.id);

  // Expand config_json into task_runs and step_runs
  const version = claimed.pipeline_definition_versions as unknown as {
    config_json: { tasks?: Record<string, { depends_on?: string[]; approval_required?: boolean; steps?: Array<{ name: string; command: string }> }> };
  } | null;

  const config = version?.config_json;
  const tasks = config?.tasks ?? {};
  const taskNames = Object.keys(tasks);

  // Create task_runs
  const taskRunInserts = taskNames.map((taskName, index) => ({
    pipeline_run_id: runId,
    task_name: taskName,
    status: "pending" as const,
    sort_order: index,
    depends_on: tasks[taskName].depends_on ?? [],
    approval_required: tasks[taskName].approval_required ?? false,
  }));

  let taskRunRecords: Array<{ id: string; task_name: string }> = [];
  if (taskRunInserts.length > 0) {
    const { data: insertedTasks } = await supabase
      .from("task_runs")
      .insert(taskRunInserts)
      .select("id, task_name");

    taskRunRecords = insertedTasks ?? [];
  }

  // Create step_runs for each task
  const stepRunInserts: Array<{
    task_run_id: string;
    step_name: string;
    status: "pending";
    sort_order: number;
    command: string;
  }> = [];

  for (const taskRun of taskRunRecords) {
    const taskConfig = tasks[taskRun.task_name];
    const steps = taskConfig?.steps ?? [];
    for (let i = 0; i < steps.length; i++) {
      stepRunInserts.push({
        task_run_id: taskRun.id,
        step_name: steps[i].name,
        status: "pending",
        sort_order: i,
        command: steps[i].command,
      });
    }
  }

  let stepRunRecords: Array<{ id: string; task_run_id: string; step_name: string; sort_order: number }> = [];
  if (stepRunInserts.length > 0) {
    const { data: insertedSteps } = await supabase
      .from("step_runs")
      .insert(stepRunInserts)
      .select("id, task_run_id, step_name, sort_order");

    stepRunRecords = insertedSteps ?? [];
  }

  // Nest step_runs under their parent task_runs
  const taskRunsWithSteps = taskRunRecords.map((tr) => ({
    ...tr,
    step_runs: stepRunRecords
      .filter((sr) => sr.task_run_id === tr.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ id, step_name, sort_order }) => ({ id, step_name, sort_order })),
  }));

  return NextResponse.json({
    claimed: true,
    run: {
      id: claimed.id,
      project_id: claimed.project_id,
      git_branch: claimed.git_branch,
      git_sha: claimed.git_sha,
      config_json: config,
      task_runs: taskRunsWithSteps,
    },
  });
}
