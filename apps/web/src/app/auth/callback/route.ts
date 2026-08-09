import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encryptSecret } from "@deployx/shared";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * OAuth callback handler (PKCE flow).
 * Supabase redirects here after GitHub OAuth with a `code` query param.
 * We exchange it for a session, capture the GitHub provider_token,
 * encrypt it, and store it for later API calls (repo listing, cloning).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          },
        },
      },
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Capture and store the GitHub access token for repo listing / private cloning
      const providerToken = data.session?.provider_token;
      if (providerToken && data.session?.user?.id) {
        try {
          const secretKey = process.env.DEPLOYX_SECRET_KEY;
          if (secretKey) {
            const encryptedToken = encryptSecret(providerToken, secretKey);
            const serviceClient = createServiceClient();
            await serviceClient.from("github_tokens").upsert(
              {
                user_id: data.session.user.id,
                encrypted_token: encryptedToken,
                scopes: "repo",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" },
            );
          }
        } catch (err) {
          // Token storage failure should not block login
          console.error("[auth/callback] Failed to store GitHub token:", err);
        }
      }

      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // If code is missing or exchange failed, redirect to login with error hint
  return NextResponse.redirect(new URL("/login?error=auth", origin));
}
