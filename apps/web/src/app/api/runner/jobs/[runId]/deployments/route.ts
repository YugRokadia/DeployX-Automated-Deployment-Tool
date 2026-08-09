import { NextResponse } from "next/server";
import { CreateDeploymentSchema } from "@deployx/shared";
import { authenticateRunner } from "@/lib/auth/runner";

interface RouteParams {
  readonly params: Promise<{ runId: string }>;
}

/**
 * POST /api/runner/jobs/[runId]/deployments
 *
 * Creates a new deployment and its initial revision.
 * Called by the runner when a task with `deploy` config starts deploying.
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

  const parsed = CreateDeploymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Look up pipeline run to get project_id and created_by
  const { data: run, error: runError } = await supabase
    .from("pipeline_runs")
    .select("project_id, created_by")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return NextResponse.json(
      { error: "Pipeline run not found" },
      { status: 404 },
    );
  }

  // Mark any existing active deployment for this project as draining
  await supabase
    .from("deployments")
    .update({
      status: "draining",
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", run.project_id)
    .eq("status", "active");

  // Create the deployment record
  const { data: deployment, error: deployError } = await supabase
    .from("deployments")
    .insert({
      project_id: run.project_id,
      pipeline_run_id: runId,
      status: "deploying",
      strategy: parsed.data.strategy,
      deploy_target: parsed.data.deploy_target,
      health_status: "unknown",
      created_by: run.created_by,
    })
    .select("id")
    .single();

  if (deployError || !deployment) {
    return NextResponse.json(
      { error: "Failed to create deployment" },
      { status: 500 },
    );
  }

  // Determine revision number (max existing + 1, or 1 for first)
  const { data: maxRevision } = await supabase
    .from("deployment_revisions")
    .select("revision_number")
    .eq("deployment_id", deployment.id)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const revisionNumber = (maxRevision?.revision_number ?? 0) + 1;

  // Create the revision
  const { data: revision, error: revisionError } = await supabase
    .from("deployment_revisions")
    .insert({
      deployment_id: deployment.id,
      revision_number: revisionNumber,
      image_tag: parsed.data.image_tag,
      image_digest: parsed.data.image_digest ?? null,
      status: "deploying",
    })
    .select("id")
    .single();

  if (revisionError || !revision) {
    return NextResponse.json(
      { error: "Failed to create deployment revision" },
      { status: 500 },
    );
  }

  // Set current_revision_id on the deployment
  await supabase
    .from("deployments")
    .update({ current_revision_id: revision.id })
    .eq("id", deployment.id);

  return NextResponse.json({
    deployment_id: deployment.id,
    revision_id: revision.id,
    revision_number: revisionNumber,
  });
}
