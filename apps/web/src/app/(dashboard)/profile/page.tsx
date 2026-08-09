import { requireUserWithOrg } from "@/lib/auth/session";
import { ProfileClient } from "./profile-client";

export default async function ProfilePage() {
  const { supabase, user, org, role } = await requireUserWithOrg();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, avatar_url, github_username, created_at")
    .eq("id", user.id)
    .single();

  const { data: recentActivity } = await supabase
    .from("audit_events")
    .select("id, action, resource_type, resource_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <ProfileClient
      user={{
        id: user.id,
        email: user.email ?? "",
        display_name: profile?.display_name ?? "Unknown",
        avatar_url: (profile?.avatar_url as string | null) ?? null,
        github_username: (profile?.github_username as string | null) ?? null,
        created_at: (profile?.created_at as string) ?? "",
      }}
      org={{ name: org.name, role }}
      recentActivity={
        (recentActivity ?? []).map((a) => ({
          id: a.id as string,
          action: a.action as string,
          resource_type: a.resource_type as string,
          resource_id: a.resource_id as string,
          created_at: a.created_at as string,
        }))
      }
    />
  );
}
