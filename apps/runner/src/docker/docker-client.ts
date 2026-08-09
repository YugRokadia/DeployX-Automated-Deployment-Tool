import { execa } from "execa";
import type { LogStreamer } from "../logging/log-streamer";

export interface DockerBuildOptions {
  /** Path to Dockerfile relative to workspace root */
  readonly dockerfilePath: string;
  /** Build context path relative to workspace root */
  readonly buildContext: string;
  /** Workspace root (absolute path) */
  readonly cwd: string;
  /** Tags to apply to the built image (e.g. "ghcr.io/user/app:abc1234") */
  readonly tags: readonly string[];
  /** LogStreamer for streaming build output */
  readonly logStreamer: LogStreamer;
  /** Log association IDs */
  readonly taskRunId?: string;
  readonly stepRunId?: string;
}

export interface DockerBuildResult {
  readonly tags: readonly string[];
  readonly digest: string | null;
  readonly sizeBytes: number | null;
}

export interface DockerPushOptions {
  /** Full image tag to push (e.g. "ghcr.io/user/app:abc1234") */
  readonly tag: string;
  /** LogStreamer for streaming push output */
  readonly logStreamer: LogStreamer;
  readonly taskRunId?: string;
  readonly stepRunId?: string;
}

/**
 * Checks if Docker is available and running on the system.
 */
export async function checkDocker(): Promise<boolean> {
  try {
    const result = await execa("docker", ["version", "--format", "{{.Server.Version}}"], {
      reject: false,
      timeout: 10_000,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Generates standard image tags for a build.
 *
 * Tags: `{registry}/{repo}:{sha7}`, `{registry}/{repo}:{branch}`, `{registry}/{repo}:latest`
 * Branch tag sanitizes non-alphanumeric chars to dashes (e.g. "feature/foo" → "feature-foo").
 */
export function generateTags(
  registry: string,
  repository: string,
  sha: string,
  branch: string,
): readonly string[] {
  const base = `${registry}/${repository}`;
  const shortSha = sha.slice(0, 7);
  const sanitizedBranch = branch.replace(/[^a-zA-Z0-9._-]/g, "-");

  return [
    `${base}:${shortSha}`,
    `${base}:${sanitizedBranch}`,
    `${base}:latest`,
  ] as const;
}

/**
 * Builds a Docker image from a Dockerfile.
 *
 * Streams build output to the LogStreamer in real-time.
 * Uses BuildKit if available (via DOCKER_BUILDKIT=1).
 */
export async function buildImage(
  options: DockerBuildOptions,
): Promise<DockerBuildResult> {
  const { dockerfilePath, buildContext, cwd, tags, logStreamer, taskRunId, stepRunId } = options;

  const args = ["build", "-f", dockerfilePath];
  for (const tag of tags) {
    args.push("-t", tag);
  }
  args.push(buildContext);

  logStreamer.push({
    level: "info",
    message: `$ docker ${args.join(" ")}`,
    task_run_id: taskRunId,
    step_run_id: stepRunId,
  });

  const subprocess = execa("docker", args, {
    cwd,
    env: { ...process.env, DOCKER_BUILDKIT: "1" },
    reject: false,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 600_000, // 10 min build timeout
  });

  // Stream build output (Docker writes progress to stderr with BuildKit)
  const stdoutDone = streamToLog(subprocess.stdout, "info", logStreamer, taskRunId, stepRunId);
  const stderrDone = streamToLog(subprocess.stderr, "info", logStreamer, taskRunId, stepRunId);

  const [result] = await Promise.all([subprocess, stdoutDone, stderrDone]);

  if (result.exitCode !== 0) {
    throw new Error(`Docker build failed with exit code ${result.exitCode}`);
  }

  // Try to get the image digest and size
  const primaryTag = tags[0];
  const digest = await getImageDigest(primaryTag);
  const sizeBytes = await getImageSize(primaryTag);

  return { tags, digest, sizeBytes };
}

/**
 * Pushes a Docker image to its registry.
 *
 * Streams push output to the LogStreamer.
 * Returns the remote digest on success, null on failure.
 */
export async function pushImage(
  options: DockerPushOptions,
): Promise<string | null> {
  const { tag, logStreamer, taskRunId, stepRunId } = options;

  logStreamer.push({
    level: "info",
    message: `$ docker push ${tag}`,
    task_run_id: taskRunId,
    step_run_id: stepRunId,
  });

  const subprocess = execa("docker", ["push", tag], {
    reject: false,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 300_000, // 5 min push timeout
  });

  const stdoutDone = streamToLog(subprocess.stdout, "info", logStreamer, taskRunId, stepRunId);
  const stderrDone = streamToLog(subprocess.stderr, "info", logStreamer, taskRunId, stepRunId);

  const [result] = await Promise.all([subprocess, stdoutDone, stderrDone]);

  if (result.exitCode !== 0) {
    logStreamer.push({
      level: "error",
      message: `Docker push failed with exit code ${result.exitCode}`,
      task_run_id: taskRunId,
      step_run_id: stepRunId,
    });
    return null;
  }

  return getImageDigest(tag);
}

/**
 * Gets the digest of a local Docker image.
 */
async function getImageDigest(tag: string): Promise<string | null> {
  try {
    const result = await execa("docker", ["inspect", "--format", "{{index .RepoDigests 0}}", tag], {
      reject: false,
      timeout: 10_000,
    });
    if (result.exitCode === 0 && result.stdout.includes("sha256:")) {
      // Extract just the digest portion: "registry/repo@sha256:abc..." → "sha256:abc..."
      const match = result.stdout.match(/sha256:[a-f0-9]+/);
      return match ? match[0] : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Gets the size of a local Docker image in bytes.
 */
async function getImageSize(tag: string): Promise<number | null> {
  try {
    const result = await execa("docker", ["inspect", "--format", "{{.Size}}", tag], {
      reject: false,
      timeout: 10_000,
    });
    if (result.exitCode === 0) {
      const size = parseInt(result.stdout.trim(), 10);
      return Number.isFinite(size) ? size : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Streams a Node.js Readable line-by-line to the LogStreamer.
 */
async function streamToLog(
  stream: import("node:stream").Readable | null,
  level: "info" | "warn" | "error",
  logStreamer: LogStreamer,
  taskRunId?: string,
  stepRunId?: string,
): Promise<void> {
  if (!stream) return;

  let partial = "";

  for await (const chunk of stream) {
    const text = partial + String(chunk);
    const lines = text.split("\n");
    partial = lines.pop() ?? "";

    for (const line of lines) {
      if (line.length > 0) {
        logStreamer.push({
          level,
          message: line,
          task_run_id: taskRunId,
          step_run_id: stepRunId,
        });
      }
    }
  }

  if (partial.length > 0) {
    logStreamer.push({
      level,
      message: partial,
      task_run_id: taskRunId,
      step_run_id: stepRunId,
    });
  }
}
