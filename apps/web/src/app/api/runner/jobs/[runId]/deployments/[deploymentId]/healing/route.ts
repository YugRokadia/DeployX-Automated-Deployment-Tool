import { NextResponse } from "next/server";
import { RecordHealingEventSchema } from "@deployx/shared";
import { authenticateRunner } from "@/lib/auth/runner";

interface RouteParams {
  readonly params: Promise<{ runId: string; deploymentId: string }>;
}

/**
 * POST /api/runner/jobs/[runId]/deployments/[deploymentId]/healing
 *
 * Records a self-healing event (restart, rollback, health state change).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { deploymentId } = await params;
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

  const parsed = RecordHealingEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { error: insertError } = await supabase
    .from("healing_events")
    .insert({
      deployment_id: deploymentId,
      event_type: parsed.data.event_type,
      attempt_number: parsed.data.attempt_number ?? null,
      container_name: parsed.data.container_name ?? null,
      details: parsed.data.details ?? null,
    });

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to record healing event" },
      { status: 500 },
    );
  }

  return NextResponse.json({ recorded: true });
}
