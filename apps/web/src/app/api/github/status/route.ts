import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getDecryptedGitHubToken } from "@/lib/github";

/**
 * GET /api/github/status
 *
 * Checks whether the authenticated user has a stored GitHub token.
 * Returns { connected: true, username } or { connected: false }.
 */
export async function GET() {
  try {
    const { supabase, user } = await requireUser();

    const result = await getDecryptedGitHubToken(user.id);

    if (!result) {
      return NextResponse.json({ connected: false });
    }

    // Validate the token is still working by fetching the GitHub user
    const ghRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${result.token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "DeployX",
      },
    });

    if (!ghRes.ok) {
      return NextResponse.json({ connected: false, reason: "token_invalid" });
    }

    const ghUser = (await ghRes.json()) as { login: string; avatar_url: string };

    return NextResponse.json({
      connected: true,
      username: ghUser.login,
      avatarUrl: ghUser.avatar_url,
      tokenId: result.tokenId,
    });
  } catch {
    return NextResponse.json({ connected: false }, { status: 500 });
  }
}
