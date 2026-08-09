import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getDecryptedGitHubToken, trimRepo } from "@/lib/github";

const GITHUB_API = "https://api.github.com";

/**
 * GET /api/github/repos?page=1&per_page=30&search=query
 *
 * Lists the authenticated user's GitHub repositories.
 * If `search` is provided, uses the GitHub search API instead.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireUser();
    const result = await getDecryptedGitHubToken(user.id);

    if (!result) {
      return NextResponse.json(
        { error: "github_not_connected" },
        { status: 401 },
      );
    }

    const { searchParams } = request.nextUrl;
    const page = searchParams.get("page") ?? "1";
    const perPage = searchParams.get("per_page") ?? "30";
    const search = searchParams.get("search")?.trim();

    const headers = {
      Authorization: `Bearer ${result.token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "DeployX",
    };

    let repos: Record<string, unknown>[];

    if (search) {
      // Use GitHub search API for filtered results
      const ghRes = await fetch(
        `${GITHUB_API}/search/repositories?q=${encodeURIComponent(search)}+in:name+fork:true&sort=updated&per_page=${perPage}&page=${page}`,
        { headers },
      );
      if (!ghRes.ok) {
        const err = await ghRes.text();
        return NextResponse.json({ error: err }, { status: ghRes.status });
      }
      const data = (await ghRes.json()) as { items: Record<string, unknown>[] };
      repos = data.items;
    } else {
      // List all repos the user has access to
      const ghRes = await fetch(
        `${GITHUB_API}/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=${perPage}&page=${page}`,
        { headers },
      );
      if (!ghRes.ok) {
        if (ghRes.status === 401) {
          return NextResponse.json(
            { error: "github_token_expired" },
            { status: 401 },
          );
        }
        const err = await ghRes.text();
        return NextResponse.json({ error: err }, { status: ghRes.status });
      }
      repos = (await ghRes.json()) as Record<string, unknown>[];
    }

    return NextResponse.json({
      repos: repos.map(trimRepo),
    });
  } catch (err) {
    console.error("[api/github/repos]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
