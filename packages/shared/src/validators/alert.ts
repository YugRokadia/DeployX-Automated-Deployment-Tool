import { z } from "zod";
import { ALERT_METRICS, ALERT_OPERATORS } from "../constants";

export const AlertMetricSchema = z.enum(ALERT_METRICS);
export type AlertMetric = z.infer<typeof AlertMetricSchema>;

export const AlertOperatorSchema = z.enum(ALERT_OPERATORS);
export type AlertOperator = z.infer<typeof AlertOperatorSchema>;

export const CreateAlertRuleSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  metric: AlertMetricSchema,
  operator: AlertOperatorSchema,
  threshold: z.number().finite(),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
  project_id: z.string().uuid().optional(),
  cooldown_minutes: z.number().int().min(1).max(1440).default(15),
});

export type CreateAlertRulePayload = z.infer<typeof CreateAlertRuleSchema>;

export const UpdateAlertRuleSchema = CreateAlertRuleSchema.partial();

export type UpdateAlertRulePayload = z.infer<typeof UpdateAlertRuleSchema>;
