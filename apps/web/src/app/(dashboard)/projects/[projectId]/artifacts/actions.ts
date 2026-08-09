"use server";

import { requireUserWithOrg } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import { hasMinRole } from "@deployx/shared";

interface ActionResult {
  readonly error?: string;
  readonly success?: boolean;
  readonly url?: string;
}

export async function getArtifactDownloadUrl(
  projectId: string,
  artifactPath: string,
): Promise<ActionResult> {
  const { supabase } = await requireUserWithOrg();

  const { data, error } = await supabase.storage
    .from("build-artifacts")
    .createSignedUrl(artifactPath, 300); // 5 minute expiry

  if (error || !data?.signedUrl) {
    return { error: "Failed to generate download URL" };
  }

  return { success: true, url: data.signedUrl };
}

export async function deleteArtifact(
  projectId: string,
  artifactPath: string,
): Promise<ActionResult> {
  const { supabase, user, org, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "admin")) {
    return { error: "You need admin permissions to delete artifacts" };
  }

  const { error } = await supabase.storage
    .from("build-artifacts")
    .remove([artifactPath]);

  if (error) {
    return { error: "Failed to delete artifact" };
  }

  await recordAuditEvent(supabase, {
    org_id: org.id,
    user_id: user.id,
    action: "delete",
    resource_type: "artifact",
    resource_id: projectId,
    details: { path: artifactPath },
  });

  return { success: true };
}
