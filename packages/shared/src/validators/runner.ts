import { z } from "zod";

// ── System Info ─────────────────────────────────────────────────

const SystemInfoSchema = z.object({
  os: z.string().min(1).max(64),
  arch: z.string().min(1).max(64),
  version: z.string().min(1).max(64),
});

export type SystemInfo = z.infer<typeof SystemInfoSchema>;

// ── Runner Registration ─────────────────────────────────────────

export const RegisterRunnerSchema = z.object({
  token: z.string().min(1, "Registration token is required"),
  name: z
    .string()
    .min(1, "Runner name is required")
    .max(128, "Runner name must be at most 128 characters"),
  system_info: SystemInfoSchema.optional(),
  capabilities: z.array(z.string().min(1).max(64)).max(32).optional(),
});

export type RegisterRunnerInput = z.infer<typeof RegisterRunnerSchema>;

// ── Heartbeat ───────────────────────────────────────────────────

export const HeartbeatSchema = z.object({
  system_info: SystemInfoSchema.optional(),
  capabilities: z.array(z.string().min(1).max(64)).max(32).optional(),
});

export type HeartbeatInput = z.infer<typeof HeartbeatSchema>;

// ── Run Status Update ───────────────────────────────────────────

export const RunStatusUpdateSchema = z.object({
  status: z.enum([
    "created",
    "queued",
    "running",
    "success",
    "failed",
    "cancelled",
    "timed_out",
    "pending",
    "skipped",
    "awaiting_approval",
  ]),
  scope: z.enum(["pipeline", "task", "step"]),
  task_name: z.string().optional(),
  step_name: z.string().optional(),
  error_message: z.string().max(4096).optional(),
  exit_code: z.number().int().optional(),
  started_at: z.string().datetime().optional(),
  finished_at: z.string().datetime().optional(),
});

export type RunStatusUpdateInput = z.infer<typeof RunStatusUpdateSchema>;

// ── Batch Log Insert ────────────────────────────────────────────

const LogEntrySchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string().min(1).max(65536),
  task_run_id: z.string().uuid().optional(),
  step_run_id: z.string().uuid().optional(),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

export const BatchLogSchema = z.object({
  logs: z
    .array(LogEntrySchema)
    .min(1, "Must include at least one log entry")
    .max(50, "Maximum 50 log entries per batch"),
});

export type BatchLogInput = z.infer<typeof BatchLogSchema>;

// ── Container Image Recording ──────────────────────────────────

export const RecordImageSchema = z.object({
  registry: z.string().min(1).max(256),
  repository: z.string().min(1).max(256),
  tag: z.string().min(1).max(256),
  digest: z.string().max(256).optional(),
  size_bytes: z.number().int().nonnegative().optional(),
});

export type RecordImageInput = z.infer<typeof RecordImageSchema>;
