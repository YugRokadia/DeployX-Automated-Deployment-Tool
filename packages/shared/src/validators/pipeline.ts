import { z } from "zod";
import { DeployConfigSchema } from "./deployment";

// ── Step Config ─────────────────────────────────────────────────

export const StepConfigSchema = z.object({
  name: z
    .string()
    .min(1, "Step name is required")
    .max(128, "Step name must be at most 128 characters"),
  command: z
    .string()
    .min(1, "Step command is required")
    .max(4096, "Step command must be at most 4096 characters"),
  image: z.string().max(256).optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeout_seconds: z.number().int().positive().max(86400).optional(),
});

export type StepConfig = z.infer<typeof StepConfigSchema>;

// ── Task Config ─────────────────────────────────────────────────

export const TaskConfigSchema = z.object({
  depends_on: z.array(z.string().min(1)).optional(),
  approval_required: z.boolean().optional(),
  steps: z
    .array(StepConfigSchema)
    .min(1, "Task must have at least one step")
    .max(50, "Task must have at most 50 steps"),
  deploy: DeployConfigSchema.optional(),
});

export type TaskConfig = z.infer<typeof TaskConfigSchema>;

// ── Pipeline Config (top-level deployx.yaml) ────────────────────

export const PipelineConfigSchema = z.object({
  name: z
    .string()
    .min(1, "Pipeline name is required")
    .max(128, "Pipeline name must be at most 128 characters"),
  tasks: z
    .record(
      z
        .string()
        .min(1)
        .max(64)
        .regex(
          /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
          "Task name must start with alphanumeric and contain only letters, numbers, hyphens, underscores",
        ),
      TaskConfigSchema,
    )
    .refine(
      (tasks) => Object.keys(tasks).length >= 1,
      "Pipeline must have at least one task",
    )
    .refine(
      (tasks) => Object.keys(tasks).length <= 100,
      "Pipeline must have at most 100 tasks",
    ),
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
