import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getNextCronRun } from "@deployx/shared";

/**
 * GET /api/cron/schedules
 *
 * Called by an external cron job every minute.
 * Finds active schedules where next_run_at <= now(),
 * creates a pipeline run for each, and advances next_run_at.
 *
 * Authentication: Bearer token matching CRON_SECRET env var.
 */
export async function GET(request: Request) {
  // Verify bearer token
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // Find all active schedules that are due
  const { data: dueSchedules, error: fetchError } = await supabase
    .from("pipeline_schedules")
    .select("id, project_id, pipeline_definition_id, cron_expression, git_branch, created_by")
    .eq("is_active", true)
    .lte("next_run_at", now);

  if (fetchError) {
    return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
  }

  if (!dueSchedules || dueSchedules.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;
  const errors: string[] = [];

  // Process each schedule independently
  for (const schedule of dueSchedules) {
    try {
      // Get the pipeline definition's current version
      const { data: definition } = await supabase
        .from("pipeline_definitions")
        .select("id, current_version_id")
        .eq("id", schedule.pipeline_definition_id)
        .single();

      if (!definition?.current_version_id) {
        errors.push(`Schedule ${schedule.id}: pipeline has no version`);
        continue;
      }

      // Create a pipeline run
      const { data: run, error: runError } = await supabase
        .from("pipeline_runs")
        .insert({
          pipeline_definition_id: schedule.pipeline_definition_id,
          pipeline_version_id: definition.current_version_id,
          project_id: schedule.project_id,
          status: "created",
          trigger_type: "schedule",
          trigger_ref: `schedule:${schedule.id}`,
          git_branch: schedule.git_branch,
          created_by: schedule.created_by,
        })
        .select("id")
        .single();

      if (runError || !run) {
        errors.push(`Schedule ${schedule.id}: failed to create run`);
        continue;
      }

      // Transition to queued
      await supabase
        .from("pipeline_runs")
        .update({ status: "queued", updated_at: new Date().toISOString() })
        .eq("id", run.id);

      // Advance next_run_at
      const nextRun = getNextCronRun(schedule.cron_expression, new Date());
      await supabase
        .from("pipeline_schedules")
        .update({
          next_run_at: nextRun.toISOString(),
          last_run_at: new Date().toISOString(),
          last_run_id: run.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", schedule.id);

      processed++;
    } catch (err) {
      errors.push(`Schedule ${schedule.id}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({
    processed,
    total: dueSchedules.length,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
