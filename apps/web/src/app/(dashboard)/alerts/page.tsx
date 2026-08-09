import { requireUserWithOrg } from "@/lib/auth/session";
import { AlertsClient } from "./alerts-client";

export default async function AlertsPage() {
  const { supabase, org, role } = await requireUserWithOrg();

  const { data: alertRules } = await supabase
    .from("alert_rules")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("org_id", org.id)
    .order("name");

  return (
    <AlertsClient
      alertRules={
        (alertRules ?? []).map((r) => ({
          id: r.id as string,
          name: r.name as string,
          metric: r.metric as string,
          operator: r.operator as string,
          threshold: r.threshold as number,
          severity: r.severity as string,
          is_active: r.is_active as boolean,
          cooldown_minutes: r.cooldown_minutes as number,
          project_id: r.project_id as string | null,
          last_triggered_at: r.last_triggered_at as string | null,
          created_at: r.created_at as string,
        }))
      }
      projects={
        (projects ?? []).map((p) => ({
          id: p.id as string,
          name: p.name as string,
        }))
      }
      currentRole={role}
    />
  );
}
