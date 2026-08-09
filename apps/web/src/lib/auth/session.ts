import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Get the authenticated user or redirect to login.
 * Use in Server Components and Server Actions.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}

/**
 * Get the user's organization (auto-creates a personal org on first login).
 * Every user must belong to at least one org to use the platform.
 */
export async function requireUserWithOrg() {
  const { supabase, user } = await requireUser();

  // Check existing membership
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id, role, organizations(id, name, slug)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membership?.org_id) {
    const org = membership.organizations as unknown as {
      id: string;
      name: string;
      slug: string;
    };
    return { supabase, user, org, role: membership.role };
  }

  // First-time user: create a personal org via SECURITY DEFINER function.
  // This bypasses RLS to avoid the chicken-and-egg problem where
  // org_memberships INSERT requires has_org_role() but the user
  // has no membership yet.
  const displayName =
    user.user_metadata?.full_name ??
    user.user_metadata?.user_name ??
    "User";
  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 48);

  const { data: newOrg, error: orgError } = await supabase.rpc(
    "bootstrap_user_org" as never,
    {
      org_name: `${displayName}'s Org`,
      org_slug: `${slug}-${Date.now()}`,
    },
  );

  if (orgError || !newOrg) {
    throw new Error(`Failed to create organization: ${orgError?.message}`);
  }

  const org = newOrg as unknown as { id: string; name: string; slug: string };

  return {
    supabase,
    user,
    org,
    role: "owner" as const,
  };
}
