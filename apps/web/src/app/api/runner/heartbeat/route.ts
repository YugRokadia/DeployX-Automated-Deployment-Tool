import { NextResponse } from "next/server";
import { HeartbeatSchema } from "@deployx/shared";
import { authenticateRunner } from "@/lib/auth/runner";

/**
 * POST /api/runner/heartbeat
 *
 * Called periodically by the runner (every HEARTBEAT_INTERVAL_MS = 10s).
 * Updates last_heartbeat_at and optionally system_info.
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateRunner(request);
    if (!auth.ok) return auth.response;

    const { runner, supabase } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = HeartbeatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {
      last_heartbeat_at: new Date().toISOString(),
      status: runner.current_job_id ? "busy" : "online",
    };

    if (parsed.data.system_info) {
      updates.system_info = parsed.data.system_info;
    }
    if (parsed.data.capabilities) {
      updates.capabilities = parsed.data.capabilities;
    }

    const { error } = await supabase
      .from("runner_registrations")
      .update(updates)
      .eq("id", runner.id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to update heartbeat" },
        { status: 500 },
      );
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/runner/heartbeat] Unhandled error: ${message}`);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
