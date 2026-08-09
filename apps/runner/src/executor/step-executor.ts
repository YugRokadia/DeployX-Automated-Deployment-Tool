import { execa, type ResultPromise } from "execa";
import type { LogStreamer } from "../logging/log-streamer";
import type { Readable } from "node:stream";

export interface StepExecutorOptions {
  /** Shell command to execute */
  readonly command: string;
  /** Working directory (the cloned workspace) */
  readonly cwd: string;
  /** Environment variables merged with process.env */
  readonly env?: Readonly<Record<string, string>>;
  /** Timeout in seconds (0 = no timeout) */
  readonly timeoutSeconds?: number;
  /** Docker image to run the command inside (optional) */
  readonly image?: string;
  /** LogStreamer instance for buffered log upload */
  readonly logStreamer: LogStreamer;
  /** IDs for log association */
  readonly taskRunId?: string;
  readonly stepRunId?: string;
}

export interface StepResult {
  readonly exitCode: number;
  readonly timedOut: boolean;
}

/**
 * Executes a single pipeline step command.
 *
 * - Runs the command via `sh -c` for shell features (pipes, env expansion)
 * - If `image` is set, wraps in `docker run --rm -v cwd:/workspace -w /workspace`
 * - Streams stdout (info) and stderr (warn) line-by-line to LogStreamer
 * - Respects timeout; returns exitCode + timedOut flag
 * - Never throws — callers check the returned exitCode
 */
export async function executeStep(
  options: StepExecutorOptions,
): Promise<StepResult> {
  const {
    command,
    cwd,
    env,
    timeoutSeconds,
    image,
    logStreamer,
    taskRunId,
    stepRunId,
  } = options;

  const resolvedCommand = image
    ? buildDockerCommand(image, cwd, command)
    : command;

  // Use the workspace cwd only for non-Docker commands.
  // Docker commands mount the workspace via -v, so cwd is less important
  // but we still set it for consistency.
  const timeoutMs = timeoutSeconds ? timeoutSeconds * 1000 : undefined;

  const subprocess = execa("sh", ["-c", resolvedCommand], {
    cwd,
    env: { ...process.env, ...env },
    timeout: timeoutMs,
    reject: false,
    // Keep stdout and stderr as streams for real-time processing
    stdout: "pipe",
    stderr: "pipe",
  });

  // Stream stdout and stderr concurrently
  const stdoutDone = streamLines(subprocess.stdout, "info", logStreamer, taskRunId, stepRunId);
  const stderrDone = streamLines(subprocess.stderr, "warn", logStreamer, taskRunId, stepRunId);

  // Wait for both stream processing and the process itself
  const [result] = await Promise.all([subprocess, stdoutDone, stderrDone]);

  return {
    exitCode: result.exitCode ?? 1,
    timedOut: result.timedOut,
  };
}

/**
 * Builds a `docker run` command that executes `command` inside `image`,
 * mounting the workspace at /workspace.
 */
function buildDockerCommand(
  image: string,
  cwd: string,
  command: string,
): string {
  // Escape single quotes in the command for safe shell wrapping
  const escaped = command.replace(/'/g, "'\\''");
  return `docker run --rm -v "${cwd}:/workspace" -w /workspace ${image} sh -c '${escaped}'`;
}

/**
 * Reads a Node.js Readable stream line-by-line and pushes each line
 * to the LogStreamer with the given log level.
 *
 * Carries partial lines across chunks to avoid splitting mid-line.
 */
async function streamLines(
  stream: Readable | null,
  level: "info" | "warn",
  logStreamer: LogStreamer,
  taskRunId?: string,
  stepRunId?: string,
): Promise<void> {
  if (!stream) return;

  let partial = "";

  for await (const chunk of stream) {
    const text = partial + String(chunk);
    const lines = text.split("\n");

    // Last element is either empty (line ended with \n) or a partial line
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

  // Flush any remaining partial line
  if (partial.length > 0) {
    logStreamer.push({
      level,
      message: partial,
      task_run_id: taskRunId,
      step_run_id: stepRunId,
    });
  }
}
