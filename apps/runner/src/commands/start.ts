import { loadConfig, listProfiles, resolveProfile } from "../config";
import { RunnerApiClient } from "../api-client";
import { executePipeline } from "../executor/pipeline-executor";
import { HealthMonitor } from "../deployers/health-monitor";
import {
  RUNNER_POLL_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
} from "@deployx/shared";

interface StartOptions {
  readonly profile?: string;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const resolved = resolveProfile(options.profile);
  if (!resolved) {
    const profiles = listProfiles();
    if (profiles.length === 0) {
      console.error("No runners registered. Run 'deployx-runner register' first.");
    } else {
      console.error("Multiple runners registered. Specify which one to start:");
      for (const p of profiles) {
        console.error(`  deployx-runner start --profile ${p}`);
      }
    }
    process.exit(1);
    return;
  }

  const config = loadConfig(resolved);
  if (!config) {
    console.error(`Runner profile "${resolved}" not found. Run 'deployx-runner register' first.`);
    process.exit(1);
    return; // TypeScript: narrow config to non-null
  }

  const client = new RunnerApiClient(config);
  let isShuttingDown = false;
  let isExecutingJob = false;

  console.log(`DeployX Runner "${config.name}" starting... (profile: ${resolved})`);
  console.log(`  Control plane: ${config.control_plane_url}`);
  console.log(`  Poll interval: ${RUNNER_POLL_INTERVAL_MS}ms`);
  console.log(`  Heartbeat interval: ${HEARTBEAT_INTERVAL_MS}ms`);
  console.log("");

  // Health monitor loop
  const monitorController = new AbortController();
  const healthMonitor = new HealthMonitor({
    client,
    signal: monitorController.signal,
  });
  healthMonitor.start();

  // Heartbeat loop
  const heartbeatInterval = setInterval(async () => {
    try {
      await client.heartbeat();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`Heartbeat failed: ${msg}`);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Send initial heartbeat
  try {
    await client.heartbeat();
    console.log("Online — heartbeat sent.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`Initial heartbeat failed: ${msg}`);
  }

  // Job polling loop
  const pollInterval = setInterval(async () => {
    if (isShuttingDown || isExecutingJob) return;

    try {
      const job = await client.pollJob();
      if (!job) return;

      console.log(`Job found: ${job.run_id} (${job.project_name})`);

      isExecutingJob = true;
      try {
        const claimed = await client.claimJob(job.run_id);
        console.log(`Job claimed: ${claimed.id}`);
        await executePipeline({ client, job, claimed });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Job execution failed: ${msg}`);
        // Try to report failure
        try {
          await client.reportStatus(job.run_id, {
            scope: "pipeline",
            status: "failed",
            finished_at: new Date().toISOString(),
          });
        } catch {
          console.error("Failed to report job failure to control plane");
        }
      } finally {
        isExecutingJob = false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (!msg.includes("409")) {
        console.error(`Poll error: ${msg}`);
      }
    }
  }, RUNNER_POLL_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log("\nShutting down...");
    clearInterval(pollInterval);
    clearInterval(heartbeatInterval);
    monitorController.abort();

    if (isExecutingJob) {
      console.log("Waiting for current job to finish...");
      // Wait up to 30s for current job
      const timeout = setTimeout(() => {
        console.log("Timeout waiting for job — exiting.");
        process.exit(1);
      }, 30_000);

      const waitForJob = () => {
        if (!isExecutingJob) {
          clearTimeout(timeout);
          finishShutdown(client);
        } else {
          setTimeout(waitForJob, 500);
        }
      };
      waitForJob();
    } else {
      await finishShutdown(client);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("Polling for jobs... (Ctrl+C to stop)");
}

async function finishShutdown(client: RunnerApiClient): Promise<void> {
  try {
    await client.heartbeat();
  } catch {
    // Best effort
  }
  console.log("Runner stopped.");
  process.exit(0);
}
