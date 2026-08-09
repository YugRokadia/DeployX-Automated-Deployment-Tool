import { z } from "zod";
import { NOTIFICATION_PAGE_SIZE } from "../constants";

export const MarkNotificationReadSchema = z.object({
  notification_ids: z
    .array(z.string().uuid())
    .min(1, "At least one notification ID required")
    .max(50, "Maximum 50 notifications at once"),
});

export type MarkNotificationReadPayload = z.infer<
  typeof MarkNotificationReadSchema
>;

export const NotificationQuerySchema = z.object({
  unread_only: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(NOTIFICATION_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
});

export type NotificationQueryPayload = z.infer<
  typeof NotificationQuerySchema
>;
