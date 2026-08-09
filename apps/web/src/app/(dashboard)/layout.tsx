import { Sidebar } from "@/components/layout/sidebar";
import { UserProvider } from "@/components/layout/user-context";
import { requireUser } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user } = await requireUser();

  const avatarUrl =
    (user.user_metadata?.avatar_url as string | undefined) ?? null;
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.user_name as string | undefined) ??
    user.email ??
    "User";

  return (
    <UserProvider avatarUrl={avatarUrl} displayName={displayName}>
      <Sidebar />
      <main className="ml-[240px] min-h-screen">{children}</main>
    </UserProvider>
  );
}
