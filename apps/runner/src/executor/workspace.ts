import { execaCommand } from "execa";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface WorkspaceOptions {
  readonly runId: string;
  readonly gitRepoUrl: string;
  readonly gitBranch: string;
  readonly gitSha: string | null;
  readonly gitCloneToken: string | null;
}

export interface Workspace {
  readonly path: string;
  readonly cleanup: () => Promise<void>;
}

/**
 * Creates a temporary workspace directory and clones a git repo into it.
 * Uses shallow clone (--depth 1) for speed.
 * If gitSha is provided, checks out that specific commit.
 */
export async function createWorkspace(
  options: WorkspaceOptions,
): Promise<Workspace> {
  const prefix = join(tmpdir(), `deployx-${options.runId.slice(0, 8)}-`);
  const workspacePath = await mkdtemp(prefix);

  try {
    // For private repos, embed the token in the clone URL
    const cloneUrl = options.gitCloneToken
      ? options.gitRepoUrl.replace(
          "https://github.com/",
          `https://x-access-token:${options.gitCloneToken}@github.com/`,
        )
      : options.gitRepoUrl;

    // Shallow clone into the workspace
    const cloneCmd = `git clone --depth 1 --branch ${options.gitBranch} -- ${cloneUrl} .`;
    await execaCommand(cloneCmd, {
      cwd: workspacePath,
      timeout: 120_000, // 2 min timeout for clone
    });

    // If a specific SHA is requested and differs from branch HEAD, fetch it
    if (options.gitSha) {
      const { stdout: headSha } = await execaCommand("git rev-parse HEAD", {
        cwd: workspacePath,
      });
      if (!headSha.trim().startsWith(options.gitSha.slice(0, 7))) {
        await execaCommand(
          `git fetch --depth 1 origin ${options.gitSha}`,
          { cwd: workspacePath, timeout: 60_000 },
        );
        await execaCommand(
          `git checkout ${options.gitSha}`,
          { cwd: workspacePath },
        );
      }
    }
  } catch (err) {
    // Clean up on failure
    await rm(workspacePath, { recursive: true, force: true }).catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to create workspace: ${message}`);
  }

  const cleanup = async () => {
    await rm(workspacePath, { recursive: true, force: true }).catch(() => {});
  };

  return { path: workspacePath, cleanup };
}

/**
 * Get the current HEAD SHA in a workspace directory.
 */
export async function getHeadSha(cwd: string): Promise<string> {
  const { stdout } = await execaCommand("git rev-parse HEAD", { cwd });
  return stdout.trim();
}
