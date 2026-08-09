"use server";

import { revalidatePath } from "next/cache";
import { requireUserWithOrg } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import { UpdateProfileSchema } from "@deployx/shared";

interface ActionResult {
  readonly error?: string;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly success?: boolean;
}

export async function updateProfile(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user, org } = await requireUserWithOrg();

  const raw: Record<string, unknown> = {};
  const displayName = formData.get("display_name") as string | null;
  if (displayName !== null) raw.display_name = displayName.trim();
  const avatarUrl = formData.get("avatar_url") as string | null;
  if (avatarUrl !== null) raw.avatar_url = avatarUrl.trim();

  const parsed = UpdateProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.display_name !== undefined) {
    updates.display_name = parsed.data.display_name;
  }
  if (parsed.data.avatar_url !== undefined) {
    updates.avatar_url = parsed.data.avatar_url || null;
  }

  const { error } = await supabase
    .from("user_profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    return { error: "Failed to update profile" };
  }

  await recordAuditEvent(supabase, {
    org_id: org.id,
    user_id: user.id,
    action: "update",
    resource_type: "user_profile",
    resource_id: user.id,
  });

  revalidatePath("/profile");
  return { success: true };
}
