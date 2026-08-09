import type {
  PipelineRunStatus,
  TaskRunStatus,
  StepRunStatus,
  DeploymentStatus,
} from "@deployx/shared";
import {
  VALID_PIPELINE_RUN_TRANSITIONS,
  VALID_TASK_RUN_TRANSITIONS,
  VALID_STEP_RUN_TRANSITIONS,
  VALID_DEPLOYMENT_TRANSITIONS,
  PIPELINE_RUN_TERMINAL_STATES,
  TASK_RUN_TERMINAL_STATES,
  STEP_RUN_TERMINAL_STATES,
  DEPLOYMENT_TERMINAL_STATES,
} from "@deployx/shared";

// ── Error Type ──────────────────────────────────────────────────

export class InvalidTransitionError extends Error {
  readonly from: string;
  readonly to: string;
  readonly entity: "pipeline" | "task" | "step" | "deployment";

  constructor(entity: "pipeline" | "task" | "step" | "deployment", from: string, to: string) {
    super(
      `Invalid ${entity} transition: "${from}" → "${to}"`,
    );
    this.name = "InvalidTransitionError";
    this.entity = entity;
    this.from = from;
    this.to = to;
  }
}

// ── Pipeline Run ────────────────────────────────────────────────

export function validatePipelineTransition(
  from: PipelineRunStatus,
  to: PipelineRunStatus,
): boolean {
  const allowed = VALID_PIPELINE_RUN_TRANSITIONS[from];
  return (allowed as readonly string[]).includes(to);
}

export function assertPipelineTransition(
  from: PipelineRunStatus,
  to: PipelineRunStatus,
): void {
  if (!validatePipelineTransition(from, to)) {
    throw new InvalidTransitionError("pipeline", from, to);
  }
}

export function isPipelineTerminal(status: PipelineRunStatus): boolean {
  return (PIPELINE_RUN_TERMINAL_STATES as readonly string[]).includes(status);
}

// ── Task Run ────────────────────────────────────────────────────

export function validateTaskTransition(
  from: TaskRunStatus,
  to: TaskRunStatus,
): boolean {
  const allowed = VALID_TASK_RUN_TRANSITIONS[from];
  return (allowed as readonly string[]).includes(to);
}

export function assertTaskTransition(
  from: TaskRunStatus,
  to: TaskRunStatus,
): void {
  if (!validateTaskTransition(from, to)) {
    throw new InvalidTransitionError("task", from, to);
  }
}

export function isTaskTerminal(status: TaskRunStatus): boolean {
  return (TASK_RUN_TERMINAL_STATES as readonly string[]).includes(status);
}

// ── Step Run ────────────────────────────────────────────────────

export function validateStepTransition(
  from: StepRunStatus,
  to: StepRunStatus,
): boolean {
  const allowed = VALID_STEP_RUN_TRANSITIONS[from];
  return (allowed as readonly string[]).includes(to);
}

export function assertStepTransition(
  from: StepRunStatus,
  to: StepRunStatus,
): void {
  if (!validateStepTransition(from, to)) {
    throw new InvalidTransitionError("step", from, to);
  }
}

export function isStepTerminal(status: StepRunStatus): boolean {
  return (STEP_RUN_TERMINAL_STATES as readonly string[]).includes(status);
}

// ── Deployment ────────────────────────────────────────────────

export function validateDeploymentTransition(
  from: DeploymentStatus,
  to: DeploymentStatus,
): boolean {
  const allowed = VALID_DEPLOYMENT_TRANSITIONS[from];
  return (allowed as readonly string[]).includes(to);
}

export function assertDeploymentTransition(
  from: DeploymentStatus,
  to: DeploymentStatus,
): void {
  if (!validateDeploymentTransition(from, to)) {
    throw new InvalidTransitionError("deployment", from, to);
  }
}

export function isDeploymentTerminal(status: DeploymentStatus): boolean {
  return (DEPLOYMENT_TERMINAL_STATES as readonly string[]).includes(status);
}
