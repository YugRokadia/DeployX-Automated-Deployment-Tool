import { NextResponse } from "next/server";
import { RecordImageSchema } from "@deployx/shared";
import { authenticateRunner } from "@/lib/auth/runner";

interface RouteParams {
  readonly params: Promise<{ runId: string }>;
}

/**
 * POST /api/runner/jobs/[runId]/images
 *
 * Records a container image built during a pipeline run.
 * The runner calls this after successfully building and (optionally) pushing
 * a Docker image, so the control plane can track which images belong to which runs.
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

  const parsed = RecordImageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Look up the pipeline run to get the project_id
  const { data: run, error: runError } = await supabase
    .from("pipeline_runs")
    .select("project_id")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return NextResponse.json(
      { error: "Pipeline run not found" },
      { status: 404 },
    );
  }

  const { error: insertError } = await supabase
    .from("container_images")
    .insert({
      project_id: run.project_id,
      pipeline_run_id: runId,
      registry: parsed.data.registry,
      repository: parsed.data.repository,
      tag: parsed.data.tag,
      digest: parsed.data.digest ?? null,
      size_bytes: parsed.data.size_bytes ?? null,
    });

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to record image" },
      { status: 500 },
    );
  }

  return NextResponse.json({ recorded: true });
}
