"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditAction } from "@deployx/shared";

interface AuditEventParams {
  readonly org_id: string;
  readonly user_id: string;
  readonly action: AuditAction;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly details?: Record<string, unknown>;
  readonly ip_address?: string;
}

/**
 * Record an audit event. Fire-and-forget — errors are logged
 * but never propagated to the caller.
 */
export async function recordAuditEvent(
  supabase: SupabaseClient,
  params: AuditEventParams,
): Promise<void> {
  try {
    await supabase.from("audit_events").insert({
      org_id: params.org_id,
      user_id: params.user_id,
      action: params.action,
      resource_type: params.resource_type,
      resource_id: params.resource_id,
      details: params.details ?? null,
      ip_address: params.ip_address ?? null,
    });
  } catch (err) {
    console.error("[audit] Failed to record event:", err);
  }
}
