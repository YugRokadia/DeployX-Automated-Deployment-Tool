import { requireUserWithOrg } from "@/lib/auth/session";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const { supabase, org, role, user } = await requireUserWithOrg();

  // Fetch org members with their profiles
  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("user_id, role, created_at, user_profiles(display_name, avatar_url, github_username)")
    .eq("org_id", org.id)
    .order("created_at", { ascending: true });

  const members = (memberships ?? []).map((m) => {
    const profile = m.user_profiles as unknown as {
      display_name: string;
      avatar_url: string | null;
      github_username: string | null;
    } | null;
    return {
      user_id: m.user_id as string,
      role: m.role as string,
      created_at: m.created_at as string,
      display_name: profile?.display_name ?? "Unknown",
      avatar_url: profile?.avatar_url ?? null,
      github_username: profile?.github_username ?? null,
    };
  });

  // Fetch pending invites
  const { data: inviteRows } = await supabase
    .from("org_invites")
    .select("id, email, role, invited_by, accepted_at, expires_at, created_at")
    .eq("org_id", org.id)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  const invites = (inviteRows ?? []).map((inv) => ({
    id: inv.id as string,
    email: inv.email as string,
    role: inv.role as string,
    invited_by: inv.invited_by as string,
    expires_at: inv.expires_at as string,
    created_at: inv.created_at as string,
  }));

  // Check for invites addressed to the current user
  const userEmail = user.email?.toLowerCase();
  const { data: myInviteRows } = userEmail
    ? await supabase
        .from("org_invites")
        .select("id, org_id, email, role, expires_at, created_at, organizations(name)")
        .eq("email", userEmail)
        .is("accepted_at", null)
    : { data: null };

  const myInvites = (myInviteRows ?? []).map((inv) => {
    const orgData = inv.organizations as unknown as { name: string } | null;
    return {
      id: inv.id as string,
      org_id: inv.org_id as string,
      org_name: orgData?.name ?? "Unknown",
      role: inv.role as string,
      expires_at: inv.expires_at as string,
      created_at: inv.created_at as string,
    };
  });

  return (
    <SettingsClient
      org={org}
      currentUserId={user.id}
      currentRole={role}
      members={members}
      pendingInvites={invites}
      myInvites={myInvites}
    />
  );
}
