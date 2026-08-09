import { execa } from "execa";

// ── Types ───────────────────────────────────────────────────────

export interface HealthCheckResult {
  readonly passed: boolean;
  readonly statusCode: number | null;
  readonly responseTimeMs: number;
  readonly error?: string;
}

export interface WaitForHealthyOptions {
  readonly url: string;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly intervalMs: number;
  readonly startPeriodMs?: number;
}

export interface DockerHealthCheckOptions {
  readonly containerName: string;
  readonly port: number;
  readonly path: string;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly intervalMs: number;
  readonly startPeriodMs?: number;
}

// ── Single Health Check ─────────────────────────────────────────

export async function checkHealth(
  url: string,
  timeoutMs: number,
): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      const responseTimeMs = Date.now() - start;
      const passed = response.status >= 200 && response.status < 400;

      return {
        passed,
        statusCode: response.status,
        responseTimeMs,
        error: passed ? undefined : `HTTP ${response.status}`,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    const message =
      err instanceof Error ? err.message : String(err);

    return {
      passed: false,
      statusCode: null,
      responseTimeMs,
      error: message,
    };
  }
}

// ── Wait for Healthy (Retry Loop) ───────────────────────────────

export async function waitForHealthy(
  options: WaitForHealthyOptions,
): Promise<HealthCheckResult> {
  const { url, timeoutMs, retries, intervalMs, startPeriodMs = 0 } = options;

  // Wait for start period before first check
  if (startPeriodMs > 0) {
    await sleep(startPeriodMs);
  }

  let lastResult: HealthCheckResult = {
    passed: false,
    statusCode: null,
    responseTimeMs: 0,
    error: "No checks performed",
  };

  for (let attempt = 0; attempt < retries; attempt++) {
    lastResult = await checkHealth(url, timeoutMs);

    if (lastResult.passed) {
      return lastResult;
    }

    // Don't sleep after last attempt
    if (attempt < retries - 1) {
      await sleep(intervalMs);
    }
  }

  return {
    ...lastResult,
    error: `Failed after ${retries} attempts. Last error: ${lastResult.error}`,
  };
}

// ── Docker Exec Health Check ─────────────────────────────────────
// Runs health check from INSIDE the container via `docker exec`.
// This avoids Docker network DNS resolution issues when the runner
// runs on the host (container names aren't resolvable from the host).

export async function checkHealthViaDocker(
  containerName: string,
  port: number,
  path: string,
  timeoutMs: number,
): Promise<HealthCheckResult> {
  const start = Date.now();
  const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));

  try {
    const result = await execa(
      "docker",
      [
        "exec",
        containerName,
        "wget",
        "-qO-",
        `--timeout=${timeoutSec}`,
        `http://localhost:${port}${path}`,
      ],
      { timeout: timeoutMs + 2000, reject: false },
    );

    const responseTimeMs = Date.now() - start;
    const passed = result.exitCode === 0;

    return {
      passed,
      statusCode: passed ? 200 : null,
      responseTimeMs,
      error: passed ? undefined : (result.stderr || `exit code ${result.exitCode}`),
    };
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    return {
      passed: false,
      statusCode: null,
      responseTimeMs,
      error: message,
    };
  }
}

export async function waitForHealthyViaDocker(
  options: DockerHealthCheckOptions,
): Promise<HealthCheckResult> {
  const {
    containerName,
    port,
    path,
    timeoutMs,
    retries,
    intervalMs,
    startPeriodMs = 0,
  } = options;

  if (startPeriodMs > 0) {
    await sleep(startPeriodMs);
  }

  let lastResult: HealthCheckResult = {
    passed: false,
    statusCode: null,
    responseTimeMs: 0,
    error: "No checks performed",
  };

  for (let attempt = 0; attempt < retries; attempt++) {
    lastResult = await checkHealthViaDocker(containerName, port, path, timeoutMs);

    if (lastResult.passed) {
      return lastResult;
    }

    if (attempt < retries - 1) {
      await sleep(intervalMs);
    }
  }

  return {
    ...lastResult,
    error: `Failed after ${retries} attempts. Last error: ${lastResult.error}`,
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
