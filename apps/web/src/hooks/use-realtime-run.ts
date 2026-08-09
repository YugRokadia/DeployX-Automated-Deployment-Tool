"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface RunData {
  readonly id: string;
  readonly status: string;
  readonly trigger_type: string;
  readonly git_branch: string | null;
  readonly git_sha: string | null;
  readonly duration_ms: number | null;
  readonly created_at: string;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly pipeline_definition_id: string;
}

interface TaskRunData {
  readonly id: string;
  readonly task_name: string;
  readonly status: string;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly duration_ms: number | null;
  readonly depends_on: readonly string[];
}

interface StepRunData {
  readonly id: string;
  readonly task_run_id: string;
  readonly step_name: string;
  readonly status: string;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly duration_ms: number | null;
  readonly exit_code: number | null;
}

interface LogData {
  readonly id: string;
  readonly task_run_id: string | null;
  readonly step_run_id: string | null;
  readonly level: string;
  readonly message: string;
  readonly timestamp: string;
}

interface UseRealtimeRunOptions {
  readonly runId: string;
  readonly initialRun: RunData;
  readonly initialTaskRuns: readonly TaskRunData[];
  readonly initialStepRuns: readonly StepRunData[];
  readonly initialLogs: readonly LogData[];
  readonly enabled?: boolean;
}

interface UseRealtimeRunResult {
  readonly run: RunData;
  readonly taskRuns: readonly TaskRunData[];
  readonly stepRuns: readonly StepRunData[];
  readonly logs: readonly LogData[];
}

const TERMINAL_STATUSES = new Set(["success", "failed", "cancelled", "timed_out"]);

export function useRealtimeRun({
  runId,
  initialRun,
  initialTaskRuns,
  initialStepRuns,
  initialLogs,
  enabled = true,
}: UseRealtimeRunOptions): UseRealtimeRunResult {
  const [run, setRun] = useState<RunData>(initialRun);
  const [taskRuns, setTaskRuns] = useState<readonly TaskRunData[]>(initialTaskRuns);
  const [stepRuns, setStepRuns] = useState<readonly StepRunData[]>(initialStepRuns);
  const [logs, setLogs] = useState<readonly LogData[]>(initialLogs);
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const knownTaskIdsRef = useRef<Set<string>>(new Set(initialTaskRuns.map((t) => t.id)));

  const shouldSubscribe = enabled && !TERMINAL_STATUSES.has(initialRun.status);

  useEffect(() => {
    if (!shouldSubscribe) return;

    const supabase = createClient();
    const channels: RealtimeChannel[] = [];

    // Channel 1: Pipeline run status updates
    const runChannel = supabase
      .channel(`run:${runId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pipeline_runs",
          filter: `id=eq.${runId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          setRun((prev) => ({
            ...prev,
            status: (updated.status as string) ?? prev.status,
            duration_ms: (updated.duration_ms as number | null) ?? prev.duration_ms,
            started_at: (updated.started_at as string | null) ?? prev.started_at,
            finished_at: (updated.finished_at as string | null) ?? prev.finished_at,
          }));

          // Auto-unsubscribe when run reaches terminal status
          if (TERMINAL_STATUSES.has(updated.status as string)) {
            for (const ch of channels) {
              supabase.removeChannel(ch);
            }
          }
        },
      )
      .subscribe();
    channels.push(runChannel);

    // Channel 2: Task run updates (status, timing)
    const taskChannel = supabase
      .channel(`tasks:${runId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_runs",
          filter: `pipeline_run_id=eq.${runId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          if (!updated.id) return;

          const taskRunData: TaskRunData = {
            id: updated.id as string,
            task_name: updated.task_name as string,
            status: updated.status as string,
            started_at: (updated.started_at as string | null) ?? null,
            finished_at: (updated.finished_at as string | null) ?? null,
            duration_ms: (updated.duration_ms as number | null) ?? null,
            depends_on: (updated.depends_on as readonly string[]) ?? [],
          };

          knownTaskIdsRef.current.add(taskRunData.id);

          setTaskRuns((prev) => {
            const existingIndex = prev.findIndex((t) => t.id === taskRunData.id);
            if (existingIndex >= 0) {
              return prev.map((t, i) => (i === existingIndex ? taskRunData : t));
            }
            return [...prev, taskRunData];
          });
        },
      )
      .subscribe();
    channels.push(taskChannel);

    // Channel 3: Step run updates
    const stepChannel = supabase
      .channel(`steps:${runId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "step_runs",
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          if (!updated.id) return;

          // Client-side filter: only process steps belonging to our tasks
          if (!knownTaskIdsRef.current.has(updated.task_run_id as string)) return;

          const stepRunData: StepRunData = {
            id: updated.id as string,
            task_run_id: updated.task_run_id as string,
            step_name: updated.step_name as string,
            status: updated.status as string,
            started_at: (updated.started_at as string | null) ?? null,
            finished_at: (updated.finished_at as string | null) ?? null,
            duration_ms: (updated.duration_ms as number | null) ?? null,
            exit_code: (updated.exit_code as number | null) ?? null,
          };

          setStepRuns((prev) => {
            const existingIndex = prev.findIndex((s) => s.id === stepRunData.id);
            if (existingIndex >= 0) {
              return prev.map((s, i) => (i === existingIndex ? stepRunData : s));
            }
            return [...prev, stepRunData];
          });
        },
      )
      .subscribe();
    channels.push(stepChannel);

    // Channel 4: Log inserts (live streaming)
    const logChannel = supabase
      .channel(`logs:${runId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "run_logs",
          filter: `pipeline_run_id=eq.${runId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (!row.id) return;

          const logEntry: LogData = {
            id: row.id as string,
            task_run_id: (row.task_run_id as string | null) ?? null,
            step_run_id: (row.step_run_id as string | null) ?? null,
            level: (row.level as string) ?? "info",
            message: (row.message as string) ?? "",
            timestamp: (row.timestamp as string) ?? new Date().toISOString(),
          };

          setLogs((prev) => [...prev, logEntry]);
        },
      )
      .subscribe();
    channels.push(logChannel);

    channelsRef.current = channels;

    return () => {
      for (const ch of channels) {
        supabase.removeChannel(ch);
      }
      channelsRef.current = [];
    };
  }, [runId, shouldSubscribe]);

  return { run, taskRuns, stepRuns, logs };
}
