import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { RunnerRegistration } from "@deployx/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hash a token using SHA-256 for storage/lookup.
 * Tokens are stored as hashes in runner_registrations.token_hash.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a cryptographically secure registration token.
 * Returns both the plaintext (shown to user once) and the hash (stored in DB).
 */
export function generateToken(): { readonly token: string; readonly hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashToken(token) };
}

/**
 * Authenticate an incoming request from a runner.
 * Extracts Bearer token from Authorization header, hashes it,
 * and looks up the runner in runner_registrations.
 *
 * Returns the runner record and a service-role Supabase client.
 * Returns a NextResponse error if authentication fails.
 */
export async function authenticateRunner(
  request: Request,
): Promise<
  | { readonly ok: true; readonly runner: RunnerRegistration; readonly supabase: SupabaseClient }
  | { readonly ok: false; readonly response: NextResponse }
> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 },
      ),
    };
  }

  const token = authHeader.slice(7);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Empty bearer token" },
        { status: 401 },
      ),
    };
  }

  const tokenHash = hashToken(token);
  const supabase = createServiceClient();

  const { data: runner, error } = await supabase
    .from("runner_registrations")
    .select("*")
    .eq("token_hash", tokenHash)
    .single();

  if (error || !runner) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid runner token" },
        { status: 401 },
      ),
    };
  }

  return { ok: true, runner: runner as RunnerRegistration, supabase };
}
