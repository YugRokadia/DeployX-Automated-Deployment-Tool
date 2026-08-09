"use server";

import { requireUserWithOrg } from "@/lib/auth/session";
import { MarkNotificationReadSchema } from "@deployx/shared";

interface ActionResult {
  readonly error?: string;
  readonly success?: boolean;
}

export async function markNotificationsRead(
  notificationIds: readonly string[],
): Promise<ActionResult> {
  const { supabase, user } = await requireUserWithOrg();

  const parsed = MarkNotificationReadSchema.safeParse({
    notification_ids: notificationIds,
  });
  if (!parsed.success) {
    return { error: "Invalid notification IDs" };
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .in("id", parsed.data.notification_ids)
    .eq("user_id", user.id);

  if (error) {
    return { error: "Failed to mark notifications as read" };
  }

  return { success: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const { supabase, user } = await requireUserWithOrg();

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) {
    return { error: "Failed to mark all notifications as read" };
  }

  return { success: true };
}
