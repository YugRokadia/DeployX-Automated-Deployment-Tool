import type { RunnerApiClient, JobPayload, ClaimedJob } from "../api-client";
import type { StepConfig, DeployConfig } from "@deployx/shared";
import { resolveDAG } from "@deployx/pipeline-engine";
import { createWorkspace, getHeadSha } from "./workspace";
import { resolveVariables, type VariableContext } from "./variable-resolver";
import { executeStep } from "./step-executor";
import { LogStreamer } from "../logging/log-streamer";
import { checkDocker, buildImage, pushImage, generateTags } from "../docker/docker-client";
import { createDeployer } from "../deployers";

export interface PipelineContext {
  readonly client: RunnerApiClient;
  readonly job: JobPayload;
  readonly claimed: ClaimedJob;
}

interface TaskConfig {
  readonly depends_on?: readonly string[];
  readonly steps?: readonly StepConfig[];
  readonly deploy?: DeployConfig;
}

/**
 * Executes a full pipeline run:
 * 1. Clone repo into temp workspace
 * 2. Resolve DAG
 * 3. Walk groups sequentially, tasks in parallel
 * 4. Execute each step via execa with log streaming
 * 5. Handle failures (skip downstream tasks)
 * 6. Always clean up workspace
 */
export async function executePipeline(ctx: PipelineContext): Promise<void> {
  const { client, job, claimed } = ctx;
  const config = claimed.config_json as { tasks?: Record<string, TaskConfig> } | null;
  const tasks = config?.tasks ?? {};
  const taskNames = Object.keys(tasks);

  if (taskNames.length === 0) {
    console.log("No tasks in pipeline — marking as success.");
    await client.reportStatus(job.run_id, {
      scope: "pipeline",
      status: "success",
      finished_at: new Date().toISOString(),
    });
    return;
  }

  // Resolve DAG
  const dag = resolveDAG(tasks);
  console.log(`DAG resolved: ${dag.groups.length} group(s), ${dag.order.length} task(s)`);

  // Create log streamer
  const logStreamer = new LogStreamer({ client, runId: job.run_id });

  // Build lookup maps: task_name → task_run, step_name → step_run
  const taskRunMap = new Map<string, string>();
  const stepRunMap = new Map<string, string>(); // key: "taskName:stepName"
  for (const tr of claimed.task_runs) {
    taskRunMap.set(tr.task_name, tr.id);
    for (const sr of tr.step_runs) {
      stepRunMap.set(`${tr.task_name}:${sr.step_name}`, sr.id);
    }
  }

  // Create workspace (clone repo)
  logStreamer.push({
    level: "info",
    message: `Cloning ${job.git_repo_url} (branch: ${job.git_branch})...`,
  });

  let workspacePath: string | null = null;
  let cleanupFn: (() => Promise<void>) | null = null;

  try {
    const workspace = await createWorkspace({
      runId: job.run_id,
      gitRepoUrl: job.git_repo_url,
      gitBranch: job.git_branch,
      gitSha: job.git_sha,
      gitCloneToken: job.git_clone_token,
    });
    workspacePath = workspace.path;
    cleanupFn = workspace.cleanup;

    logStreamer.push({
      level: "info",
      message: `Workspace ready: ${workspacePath}`,
    });

    // Get the actual HEAD SHA
    const headSha = await getHeadSha(workspacePath);
    const shortSha = headSha.slice(0, 7);

    logStreamer.push({
      level: "info",
      message: `HEAD at ${shortSha}`,
    });

    // Fetch project secrets and merge with process.env
    let projectSecrets: Record<string, string> = {};
    try {
      projectSecrets = await client.getSecrets(job.run_id);
      logStreamer.push({
        level: "info",
        message: `Loaded ${Object.keys(projectSecrets).length} project secret(s)`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStreamer.push({
        level: "warn",
        message: `Failed to fetch project secrets: ${msg} — continuing without`,
      });
    }

    // Build variable context for ${{ }} interpolation
    // Project secrets override process.env (more specific wins)
    const variableContext: VariableContext = {
      git: {
        sha: headSha,
        short_sha: shortSha,
        branch: job.git_branch,
      },
      project: {
        name: job.project_name,
        slug: job.project_slug,
      },
      env: { ...process.env, ...projectSecrets } as Record<string, string | undefined>,
    };

    // Check Docker availability once upfront
    const dockerAvailable = await checkDocker();

    // Track failed tasks to skip downstream dependents
    const failedTasks = new Set<string>();

    // Execute groups sequentially
    let cancelled = false;

    for (const group of dag.groups) {
      // Check for cancellation before each group
      try {
        const runStatus = await client.getRunStatus(job.run_id);
        if (runStatus.status === "cancelled") {
          logStreamer.push({
            level: "warn",
            message: "Run cancelled by user — aborting",
          });
          cancelled = true;
          break;
        }
      } catch {
        // If we can't check status, continue execution
      }

      // For each task in the group, check if any of its dependencies failed
      const tasksToRun: string[] = [];
      const tasksToSkip: string[] = [];

      for (const taskName of group) {
        const taskDeps = tasks[taskName]?.depends_on ?? [];
        const hasFailedDep = taskDeps.some((dep) => failedTasks.has(dep));

        if (hasFailedDep) {
          tasksToSkip.push(taskName);
        } else {
          tasksToRun.push(taskName);
        }
      }

      // Skip tasks with failed dependencies
      for (const taskName of tasksToSkip) {
        failedTasks.add(taskName); // Propagate failure downstream
        const taskRunId = taskRunMap.get(taskName);

        logStreamer.push({
          level: "warn",
          message: `[task:${taskName}] Skipped (dependency failed)`,
          task_run_id: taskRunId,
        });

        await reportSafe(client, job.run_id, {
          scope: "task",
          status: "skipped",
          task_name: taskName,
          finished_at: new Date().toISOString(),
        });

        // Skip all steps in this task too
        const taskConfig = tasks[taskName];
        for (const step of taskConfig?.steps ?? []) {
          await reportSafe(client, job.run_id, {
            scope: "step",
            status: "skipped",
            task_name: taskName,
            step_name: step.name,
            finished_at: new Date().toISOString(),
          });
        }
      }

      // Run remaining tasks in parallel
      if (tasksToRun.length > 0) {
        await Promise.all(
          tasksToRun.map(async (taskName) => {
            const success = await executeTask({
              client,
              job,
              logStreamer,
              variableContext,
              taskName,
              taskConfig: tasks[taskName],
              taskRunId: taskRunMap.get(taskName),
              stepRunMap,
              workspacePath: workspacePath!,
              dockerAvailable,
              projectSecrets,
            });

            if (!success) {
              failedTasks.add(taskName);
            }
          }),
        );
      }
    }

    // Determine final pipeline status
    // If cancelled, the status was already set by the cancel action — skip reporting
    if (!cancelled) {
      const pipelineStatus = failedTasks.size > 0 ? "failed" : "success";

      await logStreamer.shutdown();

      await client.reportStatus(job.run_id, {
        scope: "pipeline",
        status: pipelineStatus,
        finished_at: new Date().toISOString(),
      });

      console.log(`Job ${job.run_id} completed: ${pipelineStatus}`);
    } else {
      await logStreamer.shutdown();
      console.log(`Job ${job.run_id} cancelled`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logStreamer.push({
      level: "error",
      message: `Pipeline failed: ${msg}`,
    });

    await logStreamer.shutdown();

    await reportSafe(client, job.run_id, {
      scope: "pipeline",
      status: "failed",
      finished_at: new Date().toISOString(),
    });

    throw err;
  } finally {
    if (cleanupFn) {
      await cleanupFn().catch((cleanupErr) => {
        console.error(`Workspace cleanup failed: ${cleanupErr}`);
      });
    }
  }
}

// ── Task execution ─────────────────────────────────────────────────

interface ExecuteTaskOptions {
  readonly client: RunnerApiClient;
  readonly job: JobPayload;
  readonly logStreamer: LogStreamer;
  readonly variableContext: VariableContext;
  readonly taskName: string;
  readonly taskConfig: TaskConfig | undefined;
  readonly taskRunId: string | undefined;
  readonly stepRunMap: Map<string, string>;
  readonly workspacePath: string;
  readonly dockerAvailable: boolean;
  readonly projectSecrets: Record<string, string>;
}

/**
 * Execute all steps in a single task. Returns true on success, false on failure.
 */
async function executeTask(options: ExecuteTaskOptions): Promise<boolean> {
  const {
    client, job, logStreamer, variableContext,
    taskName, taskConfig, taskRunId, stepRunMap,
    workspacePath, dockerAvailable, projectSecrets,
  } = options;

  const steps = taskConfig?.steps ?? [];

  // Mark task as running
  await reportSafe(client, job.run_id, {
    scope: "task",
    status: "running",
    task_name: taskName,
    started_at: new Date().toISOString(),
  });

  logStreamer.push({
    level: "info",
    message: `[task:${taskName}] Starting (${steps.length} step(s))`,
    task_run_id: taskRunId,
  });

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepRunId = stepRunMap.get(`${taskName}:${step.name}`);

      const success = await executeStepWithReporting({
        client,
        job,
        logStreamer,
        variableContext,
        taskName,
        step,
        taskRunId,
        stepRunId,
        workspacePath,
        dockerAvailable,
      });

      if (!success) {
        // Skip remaining steps in this task
        for (let j = i + 1; j < steps.length; j++) {
          const skippedStep = steps[j];
          const skippedStepRunId = stepRunMap.get(`${taskName}:${skippedStep.name}`);

          logStreamer.push({
            level: "warn",
            message: `[step:${skippedStep.name}] Skipped (previous step failed)`,
            task_run_id: taskRunId,
            step_run_id: skippedStepRunId,
          });

          await reportSafe(client, job.run_id, {
            scope: "step",
            status: "skipped",
            task_name: taskName,
            step_name: skippedStep.name,
            finished_at: new Date().toISOString(),
          });
        }

        // Mark task as failed
        await reportSafe(client, job.run_id, {
          scope: "task",
          status: "failed",
          task_name: taskName,
          finished_at: new Date().toISOString(),
        });

        logStreamer.push({
          level: "error",
          message: `[task:${taskName}] Failed`,
          task_run_id: taskRunId,
        });

        return false;
      }
    }

    // Execute deployment if configured on this task
    if (taskConfig?.deploy) {
      const deploySuccess = await executeDeployment({
        client,
        job,
        logStreamer,
        variableContext,
        taskName,
        deployConfig: taskConfig.deploy,
        taskRunId,
        dockerAvailable,
        projectSecrets,
      });

      if (!deploySuccess) {
        await reportSafe(client, job.run_id, {
          scope: "task",
          status: "failed",
          task_name: taskName,
          finished_at: new Date().toISOString(),
        });

        logStreamer.push({
          level: "error",
          message: `[task:${taskName}] Deployment failed`,
          task_run_id: taskRunId,
        });

        return false;
      }
    }

    // Mark task as success
    await reportSafe(client, job.run_id, {
      scope: "task",
      status: "success",
      task_name: taskName,
      finished_at: new Date().toISOString(),
    });

    logStreamer.push({
      level: "info",
      message: `[task:${taskName}] Completed`,
      task_run_id: taskRunId,
    });

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logStreamer.push({
      level: "error",
      message: `[task:${taskName}] Unexpected error: ${msg}`,
      task_run_id: taskRunId,
    });

    await reportSafe(client, job.run_id, {
      scope: "task",
      status: "failed",
      task_name: taskName,
      finished_at: new Date().toISOString(),
    });

    return false;
  }
}

// ── Step execution with reporting ──────────────────────────────────

interface ExecuteStepWithReportingOptions {
  readonly client: RunnerApiClient;
  readonly job: JobPayload;
  readonly logStreamer: LogStreamer;
  readonly variableContext: VariableContext;
  readonly taskName: string;
  readonly step: StepConfig;
  readonly taskRunId: string | undefined;
  readonly stepRunId: string | undefined;
  readonly workspacePath: string;
  readonly dockerAvailable: boolean;
}

/**
 * Executes a single step with status reporting. Returns true on success.
 */
async function executeStepWithReporting(
  options: ExecuteStepWithReportingOptions,
): Promise<boolean> {
  const {
    client, job, logStreamer, variableContext,
    taskName, step, taskRunId, stepRunId,
    workspacePath, dockerAvailable,
  } = options;

  // Check if step needs Docker but it's not available
  if (step.image && !dockerAvailable) {
    logStreamer.push({
      level: "error",
      message: `[step:${step.name}] Docker not available on this runner (required for image: ${step.image})`,
      task_run_id: taskRunId,
      step_run_id: stepRunId,
    });

    await reportSafe(client, job.run_id, {
      scope: "step",
      status: "failed",
      task_name: taskName,
      step_name: step.name,
      finished_at: new Date().toISOString(),
    });

    return false;
  }

  // Mark step as running
  await reportSafe(client, job.run_id, {
    scope: "step",
    status: "running",
    task_name: taskName,
    step_name: step.name,
    started_at: new Date().toISOString(),
  });

  // Resolve variables in the command
  const resolvedCommand = resolveVariables(step.command, variableContext);

  logStreamer.push({
    level: "info",
    message: `[step:${step.name}] $ ${resolvedCommand}`,
    task_run_id: taskRunId,
    step_run_id: stepRunId,
  });

  // Build environment: step env overlays process env
  const stepEnv: Record<string, string> = {};
  if (step.env) {
    for (const [key, value] of Object.entries(step.env) as [string, string][]) {
      stepEnv[key] = resolveVariables(value, variableContext);
    }
  }

  // Execute
  const result = await executeStep({
    command: resolvedCommand,
    cwd: workspacePath,
    env: stepEnv,
    timeoutSeconds: step.timeout_seconds,
    image: step.image,
    logStreamer,
    taskRunId,
    stepRunId,
  });

  if (result.timedOut) {
    logStreamer.push({
      level: "error",
      message: `[step:${step.name}] Timed out after ${step.timeout_seconds}s`,
      task_run_id: taskRunId,
      step_run_id: stepRunId,
    });

    await reportSafe(client, job.run_id, {
      scope: "step",
      status: "failed",
      task_name: taskName,
      step_name: step.name,
      exit_code: result.exitCode,
      finished_at: new Date().toISOString(),
    });

    return false;
  }

  if (result.exitCode !== 0) {
    logStreamer.push({
      level: "error",
      message: `[step:${step.name}] Failed with exit code ${result.exitCode}`,
      task_run_id: taskRunId,
      step_run_id: stepRunId,
    });

    await reportSafe(client, job.run_id, {
      scope: "step",
      status: "failed",
      task_name: taskName,
      step_name: step.name,
      exit_code: result.exitCode,
      finished_at: new Date().toISOString(),
    });

    return false;
  }

  // Success
  logStreamer.push({
    level: "info",
    message: `[step:${step.name}] Completed (exit code 0)`,
    task_run_id: taskRunId,
    step_run_id: stepRunId,
  });

  await reportSafe(client, job.run_id, {
    scope: "step",
    status: "success",
    task_name: taskName,
    step_name: step.name,
    exit_code: 0,
    finished_at: new Date().toISOString(),
  });

  return true;
}

// ── Deployment Execution ───────────────────────────────────────────

interface ExecuteDeploymentOptions {
  readonly client: RunnerApiClient;
  readonly job: JobPayload;
  readonly logStreamer: LogStreamer;
  readonly variableContext: VariableContext;
  readonly taskName: string;
  readonly deployConfig: DeployConfig;
  readonly taskRunId: string | undefined;
  readonly dockerAvailable: boolean;
  readonly projectSecrets: Record<string, string>;
}

/**
 * Executes a deployment after task steps succeed.
 * Creates deployment record, invokes the deployer driver, reports results.
 */
async function executeDeployment(
  options: ExecuteDeploymentOptions,
): Promise<boolean> {
  const {
    client, job, logStreamer, variableContext,
    taskName, deployConfig, taskRunId, dockerAvailable, projectSecrets,
  } = options;

  // Docker is only required for docker_local deployments
  if (deployConfig.driver === "docker_local" && !dockerAvailable) {
    logStreamer.push({
      level: "error",
      message: `[deploy:${taskName}] Docker not available on this runner`,
      task_run_id: taskRunId,
    });
    return false;
  }

  // Determine image tag: explicit config or built from git SHA
  const imageTag = deployConfig.image
    ? resolveVariables(deployConfig.image, variableContext)
    : `${job.project_slug}:${variableContext.git.short_sha}`;

  logStreamer.push({
    level: "info",
    message: `[deploy:${taskName}] Starting deployment: ${imageTag} via ${deployConfig.driver}`,
    task_run_id: taskRunId,
  });

  try {
    // Create deployment record in control plane
    const { deployment_id, revision_id } = await client.createDeployment(
      job.run_id,
      {
        strategy: deployConfig.strategy,
        deploy_target: deployConfig.driver,
        image_tag: imageTag,
      },
    );

    // Create the deployer driver
    const deployer = createDeployer(
      deployConfig.driver as Parameters<typeof createDeployer>[0],
      deployConfig.strategy as Parameters<typeof createDeployer>[1],
    );

    // Execute deployment
    const result = await deployer.deploy({
      client,
      logStreamer,
      job,
      deploymentId: deployment_id,
      revisionId: revision_id,
      imageTag,
      config: deployConfig,
      projectSlug: job.project_slug,
      taskRunId,
      secrets: projectSecrets,
    });

    // Update deployment status based on result
    const finalStatus = result.success ? "active" : "failed";
    const healthStatus = result.success ? "healthy" : "unhealthy";

    try {
      await client.updateDeployment(job.run_id, deployment_id, {
        status: finalStatus,
        health_status: healthStatus,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to update deployment status: ${msg}`);
    }

    if (result.success) {
      logStreamer.push({
        level: "info",
        message: `[deploy:${taskName}] Deployment active at ${result.publicUrl ?? "unknown"}`,
        task_run_id: taskRunId,
      });
    } else {
      logStreamer.push({
        level: "error",
        message: `[deploy:${taskName}] Deployment failed: ${result.error}`,
        task_run_id: taskRunId,
      });
    }

    return result.success;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logStreamer.push({
      level: "error",
      message: `[deploy:${taskName}] Unexpected error: ${msg}`,
      task_run_id: taskRunId,
    });
    return false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Report status to the control plane. Logs errors to stderr but never throws.
 */
async function reportSafe(
  client: RunnerApiClient,
  runId: string,
  payload: Parameters<RunnerApiClient["reportStatus"]>[1],
): Promise<void> {
  try {
    await client.reportStatus(runId, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to report status: ${msg}`);
  }
}
