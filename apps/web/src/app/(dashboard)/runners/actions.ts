"use server";

import { revalidatePath } from "next/cache";
import { requireUserWithOrg } from "@/lib/auth/session";
import { generateToken } from "@/lib/auth/runner";

export interface GenerateTokenResult {
  readonly token?: string;
  readonly runner_id?: string;
  readonly error?: string;
}

/**
 * Generate a registration token for a new runner.
 * Creates a runner_registrations row with the token hash.
 * Returns the plaintext token (shown to user once).
 */
export async function generateRunnerToken(
  _prev: GenerateTokenResult,
  formData: FormData,
): Promise<GenerateTokenResult> {
  const { supabase, org } = await requireUserWithOrg();

  const name = formData.get("name") as string | null;
  if (!name || name.trim().length === 0) {
    return { error: "Runner name is required" };
  }

  const { token, hash } = generateToken();

  const { data: runner, error } = await supabase
    .from("runner_registrations")
    .insert({
      org_id: org.id,
      name: name.trim(),
      token_hash: hash,
      status: "offline",
      capabilities: [],
    })
    .select("id")
    .single();

  if (error) {
    return { error: "Failed to create runner registration" };
  }

  revalidatePath("/runners");

  return {
    token,
    runner_id: runner.id,
  };
}
