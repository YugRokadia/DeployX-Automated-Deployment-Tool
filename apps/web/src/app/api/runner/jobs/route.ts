import { NextResponse } from "next/server";
import { authenticateRunner } from "@/lib/auth/runner";
import { getDecryptedGitHubToken } from "@/lib/github";

/**
 * GET /api/runner/jobs
 *
 * Returns the next queued pipeline run for the runner's org.
 * The runner polls this endpoint every RUNNER_POLL_INTERVAL_MS (5s).
 * If the project has a linked GitHub token, the decrypted token is
 * included so the runner can clone private repositories.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateRunner(request);
    if (!auth.ok) return auth.response;

    const { runner, supabase } = auth;

    // Find the oldest queued pipeline run in the runner's org
    const { data: job, error } = await supabase
      .from("pipeline_runs")
      .select(`
        id,
        project_id,
        pipeline_definition_id,
        pipeline_version_id,
        trigger_type,
        git_branch,
        git_sha,
        created_at,
        pipeline_definition_versions!pipeline_runs_pipeline_version_id_fkey (
          config_json,
          yaml_source
        ),
        projects!pipeline_runs_project_id_fkey (
          org_id,
          name,
          slug,
          git_repo_url,
          default_branch,
          dockerfile_path,
          build_context,
          deploy_target,
          github_token_id,
          created_by
        )
      `)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to query jobs" },
        { status: 500 },
      );
    }

    // Filter by org — ensure the job belongs to the runner's org
    if (!job) {
      return NextResponse.json({ job: null });
    }

    const project = job.projects as unknown as {
      org_id: string;
      name: string;
      slug: string;
      git_repo_url: string;
      default_branch: string;
      dockerfile_path: string;
      build_context: string;
      deploy_target: string;
      github_token_id: string | null;
      created_by: string;
    } | null;
    if (!project || project.org_id !== runner.org_id) {
      return NextResponse.json({ job: null });
    }

    const version = job.pipeline_definition_versions as unknown as { config_json: Record<string, unknown>; yaml_source: string | null } | null;

    // Decrypt the GitHub token if the project has one linked
    let gitCloneToken: string | null = null;
    if (project.github_token_id) {
      // Look up the token by the project creator's user ID
      const tokenResult = await getDecryptedGitHubToken(project.created_by);
      if (tokenResult) {
        gitCloneToken = tokenResult.token;
      }
    }

    return NextResponse.json({
      job: {
        run_id: job.id,
        project_id: job.project_id,
        project_name: project.name,
        project_slug: project.slug,
        git_repo_url: project.git_repo_url,
        git_branch: job.git_branch ?? project.default_branch,
        git_sha: job.git_sha,
        git_clone_token: gitCloneToken,
        dockerfile_path: project.dockerfile_path,
        build_context: project.build_context,
        deploy_target: project.deploy_target,
        config_json: version?.config_json ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/runner/jobs] Unhandled error: ${message}`);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
