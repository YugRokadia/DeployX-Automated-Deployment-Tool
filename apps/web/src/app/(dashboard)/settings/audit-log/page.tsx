import { requireUserWithOrg } from "@/lib/auth/session";
import { AuditLogClient } from "./audit-log-client";

export default async function AuditLogPage() {
  const { supabase, org } = await requireUserWithOrg();

  const { data: events } = await supabase
    .from("audit_events")
    .select("*, user_profiles(display_name)")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: members } = await supabase
    .from("org_memberships")
    .select("user_id, user_profiles(display_name)")
    .eq("org_id", org.id);

  return (
    <AuditLogClient
      orgId={org.id}
      events={
        (events ?? []).map((e) => {
          const profile = e.user_profiles as unknown as {
            display_name: string;
          } | null;
          return {
            id: e.id as string,
            user_id: e.user_id as string,
            user_name: profile?.display_name ?? "Unknown",
            action: e.action as string,
            resource_type: e.resource_type as string,
            resource_id: e.resource_id as string,
            details: e.details as Record<string, unknown> | null,
            created_at: e.created_at as string,
          };
        })
      }
      members={
        (members ?? []).map((m) => {
          const profile = m.user_profiles as unknown as {
            display_name: string;
          } | null;
          return {
            user_id: m.user_id as string,
            display_name: profile?.display_name ?? "Unknown",
          };
        })
      }
    />
  );
}
