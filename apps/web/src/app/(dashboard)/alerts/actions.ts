"use server";

import { revalidatePath } from "next/cache";
import { requireUserWithOrg } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import { CreateAlertRuleSchema, UpdateAlertRuleSchema, hasMinRole } from "@deployx/shared";

interface ActionResult {
  readonly error?: string;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly success?: boolean;
}

export async function createAlertRule(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user, org, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "admin")) {
    return { error: "You need admin permissions to manage alert rules" };
  }

  const raw = {
    name: (formData.get("name") as string | null)?.trim(),
    metric: formData.get("metric") as string | null,
    operator: formData.get("operator") as string | null,
    threshold: Number(formData.get("threshold")),
    severity: (formData.get("severity") as string | null) ?? undefined,
    project_id: (formData.get("project_id") as string | null) || undefined,
    cooldown_minutes: formData.get("cooldown_minutes")
      ? Number(formData.get("cooldown_minutes"))
      : undefined,
  };

  const parsed = CreateAlertRuleSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { data, error } = await supabase
    .from("alert_rules")
    .insert({
      org_id: org.id,
      ...parsed.data,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: "Failed to create alert rule" };
  }

  await recordAuditEvent(supabase, {
    org_id: org.id,
    user_id: user.id,
    action: "create",
    resource_type: "alert_rule",
    resource_id: data.id,
    details: { name: parsed.data.name, metric: parsed.data.metric },
  });

  revalidatePath("/alerts");
  return { success: true };
}

export async function updateAlertRule(
  ruleId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user, org, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "admin")) {
    return { error: "You need admin permissions to manage alert rules" };
  }

  const raw: Record<string, unknown> = {};
  const name = formData.get("name") as string | null;
  if (name) raw.name = name.trim();
  const metric = formData.get("metric") as string | null;
  if (metric) raw.metric = metric;
  const operator = formData.get("operator") as string | null;
  if (operator) raw.operator = operator;
  const threshold = formData.get("threshold");
  if (threshold !== null && threshold !== "") raw.threshold = Number(threshold);
  const severity = formData.get("severity") as string | null;
  if (severity) raw.severity = severity;
  const cooldown = formData.get("cooldown_minutes");
  if (cooldown !== null && cooldown !== "") raw.cooldown_minutes = Number(cooldown);

  const parsed = UpdateAlertRuleSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("alert_rules")
    .update(parsed.data)
    .eq("id", ruleId)
    .eq("org_id", org.id);

  if (error) {
    return { error: "Failed to update alert rule" };
  }

  await recordAuditEvent(supabase, {
    org_id: org.id,
    user_id: user.id,
    action: "update",
    resource_type: "alert_rule",
    resource_id: ruleId,
  });

  revalidatePath("/alerts");
  return { success: true };
}

export async function toggleAlertRule(ruleId: string): Promise<ActionResult> {
  const { supabase, user, org, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "admin")) {
    return { error: "You need admin permissions to manage alert rules" };
  }

  const { data: rule, error: fetchError } = await supabase
    .from("alert_rules")
    .select("is_active")
    .eq("id", ruleId)
    .eq("org_id", org.id)
    .single();

  if (fetchError || !rule) {
    return { error: "Alert rule not found" };
  }

  const { error } = await supabase
    .from("alert_rules")
    .update({ is_active: !rule.is_active })
    .eq("id", ruleId);

  if (error) {
    return { error: "Failed to toggle alert rule" };
  }

  await recordAuditEvent(supabase, {
    org_id: org.id,
    user_id: user.id,
    action: "update",
    resource_type: "alert_rule",
    resource_id: ruleId,
    details: { is_active: !rule.is_active },
  });

  revalidatePath("/alerts");
  return { success: true };
}

export async function deleteAlertRule(ruleId: string): Promise<ActionResult> {
  const { supabase, user, org, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "admin")) {
    return { error: "You need admin permissions to manage alert rules" };
  }

  const { error } = await supabase
    .from("alert_rules")
    .delete()
    .eq("id", ruleId)
    .eq("org_id", org.id);

  if (error) {
    return { error: "Failed to delete alert rule" };
  }

  await recordAuditEvent(supabase, {
    org_id: org.id,
    user_id: user.id,
    action: "delete",
    resource_type: "alert_rule",
    resource_id: ruleId,
  });

  revalidatePath("/alerts");
  return { success: true };
}
