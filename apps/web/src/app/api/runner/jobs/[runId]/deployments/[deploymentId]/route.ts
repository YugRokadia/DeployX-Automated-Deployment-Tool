import { NextResponse } from "next/server";
import { UpdateDeploymentSchema } from "@deployx/shared";
import { authenticateRunner } from "@/lib/auth/runner";
import {
  assertDeploymentTransition,
  InvalidTransitionError,
} from "@deployx/pipeline-engine";

interface RouteParams {
  readonly params: Promise<{ runId: string; deploymentId: string }>;
}

/**
 * PATCH /api/runner/jobs/[runId]/deployments/[deploymentId]
 *
 * Updates deployment status and/or health status.
 * Validates state transitions using the deployment state machine.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { runId, deploymentId } = await params;
  const auth = await authenticateRunner(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  void runId; // Used for auth context; deployment identified by deploymentId

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = UpdateDeploymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Fetch current deployment
  const { data: deployment, error: fetchError } = await supabase
    .from("deployments")
    .select("id, status, current_revision_id")
    .eq("id", deploymentId)
    .single();

  if (fetchError || !deployment) {
    return NextResponse.json(
      { error: "Deployment not found" },
      { status: 404 },
    );
  }

  // Validate state transition
  try {
    assertDeploymentTransition(
      deployment.status as Parameters<typeof assertDeploymentTransition>[0],
      parsed.data.status as Parameters<typeof assertDeploymentTransition>[1],
    );
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return NextResponse.json(
        { error: err.message },
        { status: 422 },
      );
    }
    throw err;
  }

  // Build update payload
  const updates: Record<string, unknown> = {
    status: parsed.data.status,
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.health_status) {
    updates.health_status = parsed.data.health_status;
  }

  const { error: updateError } = await supabase
    .from("deployments")
    .update(updates)
    .eq("id", deploymentId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update deployment" },
      { status: 500 },
    );
  }

  // Also update the current revision status
  if (deployment.current_revision_id) {
    await supabase
      .from("deployment_revisions")
      .update({ status: parsed.data.status })
      .eq("id", deployment.current_revision_id);
  }

  return NextResponse.json({
    updated: true,
    deployment_id: deploymentId,
    status: parsed.data.status,
  });
}
