import { NextResponse } from "next/server";
import { authenticateRunner } from "@/lib/auth/runner";
import { decryptSecret } from "@deployx/shared";

interface RouteParams {
  readonly params: Promise<{ runId: string }>;
}

/**
 * GET /api/runner/jobs/[runId]/secrets
 *
 * Returns decrypted project secrets for the run's project.
 * Only accessible by authenticated runners via service_role.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { runId } = await params;
  const auth = await authenticateRunner(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;

  // Get the project_id for this run
  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("project_id")
    .eq("id", runId)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Fetch all secrets for the project
  const { data: secrets, error } = await supabase
    .from("project_secrets")
    .select("key, encrypted_value")
    .eq("project_id", run.project_id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch secrets" },
      { status: 500 },
    );
  }

  const encryptionKey = process.env.DEPLOYX_SECRET_KEY;
  if (!encryptionKey) {
    // No encryption key — return empty secrets rather than failing the run
    console.warn("DEPLOYX_SECRET_KEY not set — returning empty secrets");
    return NextResponse.json({ secrets: {} });
  }

  // Decrypt all secrets
  const decryptedSecrets: Record<string, string> = {};
  for (const secret of secrets ?? []) {
    try {
      decryptedSecrets[secret.key] = decryptSecret(
        secret.encrypted_value,
        encryptionKey,
      );
    } catch (err) {
      console.error(`Failed to decrypt secret "${secret.key}":`, err);
      // Skip secrets that fail to decrypt rather than failing the entire request
    }
  }

  return NextResponse.json({ secrets: decryptedSecrets });
}
