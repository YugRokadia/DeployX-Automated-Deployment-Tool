import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getDecryptedGitHubToken } from "@/lib/github";

/**
 * GET /api/github/repos/:owner/:repo/branches
 *
 * Lists branches for a specific GitHub repository.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const { user } = await requireUser();
    const result = await getDecryptedGitHubToken(user.id);

    if (!result) {
      return NextResponse.json(
        { error: "github_not_connected" },
        { status: 401 },
      );
    }

    const { owner, repo } = await params;

    const ghRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${result.token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "DeployX",
        },
      },
    );

    if (!ghRes.ok) {
      const err = await ghRes.text();
      return NextResponse.json({ error: err }, { status: ghRes.status });
    }

    const data = (await ghRes.json()) as { name: string }[];

    return NextResponse.json({
      branches: data.map((b) => ({ name: b.name })),
    });
  } catch (err) {
    console.error("[api/github/branches]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
