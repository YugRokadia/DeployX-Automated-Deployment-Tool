"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUserWithOrg } from "@/lib/auth/session";
import {
  encryptSecret,
  hasMinRole,
  WebhookConfigSchema,
} from "@deployx/shared";

interface ActionResult {
  readonly error?: string;
  readonly success?: boolean;
  readonly webhookSecret?: string;
}

function getEncryptionKey(): string {
  const key = process.env.DEPLOYX_SECRET_KEY;
  if (!key) {
    throw new Error("DEPLOYX_SECRET_KEY environment variable is not set");
  }
  return key;
}

/**
 * Generate a random webhook secret (32 bytes, hex-encoded).
 */
function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Create a webhook configuration for a project.
 * Returns the plaintext secret so the user can copy it (shown only once).
 */
export async function createWebhookConfig(
  projectId: string,
): Promise<ActionResult> {
  const { supabase, user, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to manage webhooks" };
  }

  const plainSecret = generateWebhookSecret();
  let encryptedSecret: string;
  try {
    encryptedSecret = encryptSecret(plainSecret, getEncryptionKey());
  } catch {
    return { error: "Failed to encrypt webhook secret" };
  }

  const { error } = await supabase.from("webhook_configs").insert({
    project_id: projectId,
    secret_encrypted: encryptedSecret,
    created_by: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "A webhook is already configured for this project" };
    }
    return { error: "Failed to create webhook configuration" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true, webhookSecret: plainSecret };
}

/**
 * Delete a webhook configuration.
 */
export async function deleteWebhookConfig(
  projectId: string,
  configId: string,
): Promise<ActionResult> {
  const { supabase, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to manage webhooks" };
  }

  const { error } = await supabase
    .from("webhook_configs")
    .delete()
    .eq("id", configId)
    .eq("project_id", projectId);

  if (error) {
    return { error: "Failed to delete webhook configuration" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/**
 * Toggle a webhook configuration's active state.
 */
export async function toggleWebhookConfig(
  projectId: string,
  configId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const { supabase, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to manage webhooks" };
  }

  const { error } = await supabase
    .from("webhook_configs")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", configId)
    .eq("project_id", projectId);

  if (error) {
    return { error: "Failed to update webhook configuration" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/**
 * Regenerate the webhook secret. Returns the new plaintext secret (shown only once).
 */
export async function regenerateWebhookSecret(
  projectId: string,
  configId: string,
): Promise<ActionResult> {
  const { supabase, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to manage webhooks" };
  }

  const plainSecret = generateWebhookSecret();
  let encryptedSecret: string;
  try {
    encryptedSecret = encryptSecret(plainSecret, getEncryptionKey());
  } catch {
    return { error: "Failed to encrypt webhook secret" };
  }

  const { error } = await supabase
    .from("webhook_configs")
    .update({
      secret_encrypted: encryptedSecret,
      updated_at: new Date().toISOString(),
    })
    .eq("id", configId)
    .eq("project_id", projectId);

  if (error) {
    return { error: "Failed to regenerate webhook secret" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true, webhookSecret: plainSecret };
}

/**
 * Update webhook configuration (branch filter, pipeline definition).
 */
export async function updateWebhookConfig(
  projectId: string,
  configId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to manage webhooks" };
  }

  const raw = {
    branch_filter: (formData.get("branch_filter") as string | null)?.trim() || null,
    pipeline_definition_id: (formData.get("pipeline_definition_id") as string | null) || null,
  };

  const parsed = WebhookConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.branch_filter !== undefined) {
    updates.branch_filter = parsed.data.branch_filter || null;
  }
  if (parsed.data.pipeline_definition_id !== undefined) {
    updates.pipeline_definition_id = parsed.data.pipeline_definition_id || null;
  }

  const { error } = await supabase
    .from("webhook_configs")
    .update(updates)
    .eq("id", configId)
    .eq("project_id", projectId);

  if (error) {
    return { error: "Failed to update webhook configuration" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}
