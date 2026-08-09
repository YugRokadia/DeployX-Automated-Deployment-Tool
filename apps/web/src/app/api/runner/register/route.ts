import { NextResponse } from "next/server";
import { RegisterRunnerSchema } from "@deployx/shared";
import { hashToken } from "@/lib/auth/runner";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/runner/register
 *
 * Called by the runner CLI during registration.
 * The dashboard pre-creates a runner_registrations row with token_hash.
 * This endpoint updates it with the runner's name, system_info, and capabilities.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = RegisterRunnerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { token, name, system_info, capabilities } = parsed.data;
  const tokenHash = hashToken(token);
  const supabase = createServiceClient();

  // Look up the pre-created runner registration by token hash
  const { data: existing, error: lookupError } = await supabase
    .from("runner_registrations")
    .select("id, status")
    .eq("token_hash", tokenHash)
    .single();

  if (lookupError || !existing) {
    return NextResponse.json(
      { error: "Invalid or expired registration token" },
      { status: 401 },
    );
  }

  // Update the runner with its actual details
  const { data: runner, error: updateError } = await supabase
    .from("runner_registrations")
    .update({
      name,
      system_info: system_info ?? null,
      capabilities: capabilities ?? [],
      status: "offline",
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .select("id, name, org_id")
    .single();

  if (updateError || !runner) {
    return NextResponse.json(
      { error: "Failed to complete registration" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    runner_id: runner.id,
    name: runner.name,
    message: "Runner registered successfully",
  });
}
