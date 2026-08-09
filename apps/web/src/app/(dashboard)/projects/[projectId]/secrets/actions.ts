"use server";

import { revalidatePath } from "next/cache";
import { requireUserWithOrg } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import {
  CreateSecretSchema,
  UpdateSecretSchema,
  encryptSecret,
  hasMinRole,
} from "@deployx/shared";

interface ActionResult {
  readonly error?: string;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly success?: boolean;
}

function getEncryptionKey(): string {
  const key = process.env.DEPLOYX_SECRET_KEY;
  if (!key) {
    throw new Error("DEPLOYX_SECRET_KEY environment variable is not set");
  }
  return key;
}

/**
 * Create a new environment variable / secret for a project.
 */
export async function createSecret(
  projectId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user, org, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to manage secrets" };
  }

  const raw = {
    key: (formData.get("key") as string | null)?.trim(),
    value: (formData.get("value") as string | null)?.trim(),
    is_secret: formData.get("is_secret") === "true",
  };

  const parsed = CreateSecretSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let encryptedValue: string;
  try {
    encryptedValue = encryptSecret(parsed.data.value, getEncryptionKey());
  } catch {
    return { error: "Failed to encrypt secret value" };
  }

  const { error } = await supabase.from("project_secrets").insert({
    project_id: projectId,
    key: parsed.data.key,
    encrypted_value: encryptedValue,
    is_secret: parsed.data.is_secret,
    created_by: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: { key: ["A variable with this key already exists"] },
      };
    }
    return { error: "Failed to create secret" };
  }

  recordAuditEvent(supabase, {
    org_id: org.id,
    user_id: user.id,
    action: "create",
    resource_type: "secret",
    resource_id: projectId,
    details: { key: parsed.data.key },
  });

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/**
 * Update an existing environment variable / secret.
 */
export async function updateSecret(
  projectId: string,
  secretId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to manage secrets" };
  }

  const raw = {
    value: (formData.get("value") as string | null)?.trim(),
    is_secret:
      formData.get("is_secret") !== null
        ? formData.get("is_secret") === "true"
        : undefined,
  };

  const parsed = UpdateSecretSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let encryptedValue: string;
  try {
    encryptedValue = encryptSecret(parsed.data.value, getEncryptionKey());
  } catch {
    return { error: "Failed to encrypt secret value" };
  }

  const updates: Record<string, unknown> = {
    encrypted_value: encryptedValue,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.is_secret !== undefined) {
    updates.is_secret = parsed.data.is_secret;
  }

  const { error } = await supabase
    .from("project_secrets")
    .update(updates)
    .eq("id", secretId)
    .eq("project_id", projectId);

  if (error) {
    return { error: "Failed to update secret" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/**
 * Delete an environment variable / secret.
 */
export async function deleteSecret(
  projectId: string,
  secretId: string,
): Promise<ActionResult> {
  const { supabase, user, org, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to manage secrets" };
  }

  const { error } = await supabase
    .from("project_secrets")
    .delete()
    .eq("id", secretId)
    .eq("project_id", projectId);

  if (error) {
    return { error: "Failed to delete secret" };
  }

  recordAuditEvent(supabase, {
    org_id: org.id,
    user_id: user.id,
    action: "delete",
    resource_type: "secret",
    resource_id: secretId,
  });

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}
