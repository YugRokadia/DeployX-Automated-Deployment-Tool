import { z } from "zod";

export const AuditEventQuerySchema = z.object({
  resource_type: z.string().max(100).optional(),
  user_id: z.string().uuid().optional(),
  action: z
    .enum([
      "create",
      "update",
      "delete",
      "trigger",
      "approve",
      "reject",
      "rollback",
      "login",
    ])
    .optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export type AuditEventQueryPayload = z.infer<typeof AuditEventQuerySchema>;

export const CreateAuditEventSchema = z.object({
  action: z.enum([
    "create",
    "update",
    "delete",
    "trigger",
    "approve",
    "reject",
    "rollback",
    "login",
  ]),
  resource_type: z.string().min(1).max(100),
  resource_id: z.string().uuid(),
  details: z.record(z.unknown()).optional(),
  ip_address: z.string().max(45).optional(),
});

export type CreateAuditEventPayload = z.infer<typeof CreateAuditEventSchema>;
