import { NextResponse } from "next/server";
import {
  RecordHealthCheckSchema,
  HEALTH_CHECK_WINDOW_SIZE,
  HEALTH_THRESHOLD_HEALTHY,
  HEALTH_THRESHOLD_DEGRADED,
} from "@deployx/shared";
import { authenticateRunner } from "@/lib/auth/runner";

interface RouteParams {
  readonly params: Promise<{ runId: string; deploymentId: string }>;
}

/**
 * POST /api/runner/jobs/[runId]/deployments/[deploymentId]/health
 *
 * Records a health check result and updates the deployment's aggregate health status.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { runId, deploymentId } = await params;
  const auth = await authenticateRunner(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  void runId; // Used for auth context

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = RecordHealthCheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Insert the health check result
  const { error: insertError } = await supabase
    .from("health_check_results")
    .insert({
      deployment_id: deploymentId,
      status: parsed.data.status,
      response_time_ms: parsed.data.response_time_ms ?? null,
      status_code: parsed.data.status_code ?? null,
      error_message: parsed.data.error_message ?? null,
      checked_at: new Date().toISOString(),
    });

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to record health check" },
      { status: 500 },
    );
  }

  // Compute aggregate health from last N checks
  const { data: recentChecks } = await supabase
    .from("health_check_results")
    .select("status")
    .eq("deployment_id", deploymentId)
    .order("checked_at", { ascending: false })
    .limit(HEALTH_CHECK_WINDOW_SIZE);

  let healthStatus = "unknown";

  if (recentChecks && recentChecks.length > 0) {
    const passCount = recentChecks.filter(
      (c: { status: string }) => c.status === "pass",
    ).length;
    const passRate = passCount / recentChecks.length;

    if (passRate >= HEALTH_THRESHOLD_HEALTHY) {
      healthStatus = "healthy";
    } else if (passRate >= HEALTH_THRESHOLD_DEGRADED) {
      healthStatus = "degraded";
    } else {
      healthStatus = "unhealthy";
    }
  }

  // Update deployment health_status
  await supabase
    .from("deployments")
    .update({
      health_status: healthStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deploymentId);

  return NextResponse.json({
    recorded: true,
    health_status: healthStatus,
  });
}
