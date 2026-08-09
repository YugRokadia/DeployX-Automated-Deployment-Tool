import { NextResponse } from "next/server";
import { BatchLogSchema } from "@deployx/shared";
import { authenticateRunner } from "@/lib/auth/runner";

interface RouteParams {
  readonly params: Promise<{ runId: string }>;
}

/**
 * POST /api/runner/jobs/[runId]/logs
 *
 * Batch insert log entries for a pipeline run.
 * The runner batches logs and sends them every LOG_BATCH_INTERVAL_MS (500ms)
 * or when LOG_BATCH_MAX_LINES (50) are accumulated.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { runId } = await params;
  const auth = await authenticateRunner(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = BatchLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const rows = parsed.data.logs.map((log) => ({
    pipeline_run_id: runId,
    task_run_id: log.task_run_id ?? null,
    step_run_id: log.step_run_id ?? null,
    level: log.level,
    message: log.message,
    timestamp: log.timestamp ?? new Date().toISOString(),
    metadata: log.metadata ?? null,
  }));

  const { error, count } = await supabase
    .from("run_logs")
    .insert(rows);

  if (error) {
    return NextResponse.json(
      { error: "Failed to insert logs" },
      { status: 500 },
    );
  }

  return NextResponse.json({ inserted: rows.length });
}
