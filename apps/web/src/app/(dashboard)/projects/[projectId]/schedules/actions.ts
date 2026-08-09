"use server";

import { revalidatePath } from "next/cache";
import { requireUserWithOrg } from "@/lib/auth/session";
import {
  hasMinRole,
  CreateScheduleSchema,
  UpdateScheduleSchema,
  getNextCronRun,
} from "@deployx/shared";

interface ActionResult {
  readonly error?: string;
  readonly success?: boolean;
}

/**
 * Create a pipeline schedule for a project.
 */
export async function createSchedule(
  projectId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to manage schedules" };
  }

  const raw = {
    pipeline_definition_id: formData.get("pipeline_definition_id") as string,
    cron_expression: formData.get("cron_expression") as string,
    timezone: (formData.get("timezone") as string) || "UTC",
    git_branch: (formData.get("git_branch") as string)?.trim() || null,
  };

  const parsed = CreateScheduleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Compute the first next_run_at
  let nextRunAt: string;
  try {
    nextRunAt = getNextCronRun(parsed.data.cron_expression, new Date()).toISOString();
  } catch {
    return { error: "Could not compute next run time from cron expression" };
  }

  const { error } = await supabase.from("pipeline_schedules").insert({
    project_id: projectId,
    pipeline_definition_id: parsed.data.pipeline_definition_id,
    cron_expression: parsed.data.cron_expression,
    timezone: parsed.data.timezone,
    git_branch: parsed.data.git_branch,
    next_run_at: nextRunAt,
    created_by: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "A schedule already exists for this pipeline" };
    }
    return { error: "Failed to create schedule" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/**
 * Update an existing pipeline schedule.
 */
export async function updateSchedule(
  projectId: string,
  scheduleId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to manage schedules" };
  }

  const raw: Record<string, unknown> = {};
  const cronExpr = formData.get("cron_expression") as string | null;
  const gitBranch = formData.get("git_branch") as string | null;
  const timezone = formData.get("timezone") as string | null;

  if (cronExpr) raw.cron_expression = cronExpr;
  if (gitBranch !== null) raw.git_branch = gitBranch?.trim() || null;
  if (timezone) raw.timezone = timezone;

  const parsed = UpdateScheduleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const updates: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };

  // Recompute next_run_at if cron expression changed
  if (parsed.data.cron_expression) {
    try {
      updates.next_run_at = getNextCronRun(parsed.data.cron_expression, new Date()).toISOString();
    } catch {
      return { error: "Could not compute next run time from cron expression" };
    }
  }

  const { error } = await supabase
    .from("pipeline_schedules")
    .update(updates)
    .eq("id", scheduleId)
    .eq("project_id", projectId);

  if (error) {
    return { error: "Failed to update schedule" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/**
 * Delete a pipeline schedule.
 */
export async function deleteSchedule(
  projectId: string,
  scheduleId: string,
): Promise<ActionResult> {
  const { supabase, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to manage schedules" };
  }

  const { error } = await supabase
    .from("pipeline_schedules")
    .delete()
    .eq("id", scheduleId)
    .eq("project_id", projectId);

  if (error) {
    return { error: "Failed to delete schedule" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/**
 * Toggle a pipeline schedule's active state.
 */
export async function toggleSchedule(
  projectId: string,
  scheduleId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const { supabase, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to manage schedules" };
  }

  const updates: Record<string, unknown> = {
    is_active: isActive,
    updated_at: new Date().toISOString(),
  };

  // If re-activating, recompute next_run_at
  if (isActive) {
    const { data: schedule } = await supabase
      .from("pipeline_schedules")
      .select("cron_expression")
      .eq("id", scheduleId)
      .single();

    if (schedule) {
      try {
        updates.next_run_at = getNextCronRun(schedule.cron_expression, new Date()).toISOString();
      } catch {
        // Keep existing next_run_at
      }
    }
  }

  const { error } = await supabase
    .from("pipeline_schedules")
    .update(updates)
    .eq("id", scheduleId)
    .eq("project_id", projectId);

  if (error) {
    return { error: "Failed to update schedule" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}
