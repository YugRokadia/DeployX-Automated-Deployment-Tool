"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { PipelineDAG } from "@/components/pipeline/pipeline-dag";
import { useRealtimeRun } from "@/hooks/use-realtime-run";
import { cancelPipelineRun } from "../../runs/actions";
import { formatTime } from "@/lib/format-date";

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

interface RunDetailClientProps {
  readonly project: { readonly id: string; readonly name: string };
  readonly run: RunData;
  readonly definitionName: string;
  readonly taskRuns: readonly TaskRunData[];
  readonly stepRuns: readonly StepRunData[];
  readonly logs: readonly LogData[];
}

const STATUS_CONFIG: Record<string, { label: string; className: string; dotClass: string }> = {
  success: { label: "Success", className: "bg-tertiary/10 text-tertiary", dotClass: "bg-tertiary" },
  failed: { label: "Failed", className: "bg-error/10 text-error", dotClass: "bg-error" },
  running: { label: "Running", className: "bg-primary/10 text-primary", dotClass: "bg-primary animate-pulse" },
  queued: { label: "Queued", className: "bg-on-surface-variant/10 text-on-surface-variant", dotClass: "bg-on-surface-variant/40" },
  created: { label: "Created", className: "bg-on-surface-variant/10 text-on-surface-variant", dotClass: "bg-on-surface-variant/40" },
  pending: { label: "Pending", className: "bg-on-surface-variant/10 text-on-surface-variant", dotClass: "bg-on-surface-variant/40" },
  cancelled: { label: "Cancelled", className: "bg-on-surface-variant/10 text-on-surface-variant", dotClass: "bg-on-surface-variant/40" },
  skipped: { label: "Skipped", className: "bg-on-surface-variant/10 text-on-surface-variant", dotClass: "bg-on-surface-variant/40" },
  timed_out: { label: "Timed Out", className: "bg-error/10 text-error", dotClass: "bg-error" },
};

const LOG_LEVEL_CLASS: Record<string, string> = {
  error: "text-error",
  warn: "text-[#f59e0b]",
  info: "text-on-surface-variant/90",
  debug: "text-on-surface-variant/50",
};

type TopView = "dag" | "list";

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function RunDetailClient({
  project,
  run: initialRun,
  definitionName,
  taskRuns: initialTaskRuns,
  stepRuns: initialStepRuns,
  logs: initialLogs,
}: RunDetailClientProps) {
  const { run, taskRuns, stepRuns, logs } = useRealtimeRun({
    runId: initialRun.id,
    initialRun,
    initialTaskRuns,
    initialStepRuns,
    initialLogs,
  });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [logLevelFilter, setLogLevelFilter] = useState<string>("all");
  const [logSearchQuery, setLogSearchQuery] = useState<string>("");
  const [activeView, setActiveView] = useState<TopView>("dag");
  const logEndRef = useRef<HTMLDivElement>(null);
  const prevLogCountRef = useRef(logs.length);
  const [isCancelling, startCancelTransition] = useTransition();

  const status = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.created;
  const isTerminal = ["success", "failed", "cancelled", "timed_out"].includes(run.status);

  const filteredLogs = logs.filter((log) => {
    if (selectedTaskId && log.task_run_id !== selectedTaskId) return false;
    if (logLevelFilter !== "all" && log.level !== logLevelFilter) return false;
    if (logSearchQuery && !log.message.toLowerCase().includes(logSearchQuery.toLowerCase())) return false;
    return true;
  });

  const stepsForTask = (taskId: string) =>
    stepRuns.filter((s) => s.task_run_id === taskId);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (logs.length > prevLogCountRef.current) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLogCountRef.current = logs.length;
  }, [logs.length]);

  return (
    <div className="flex flex-col h-[calc(100vh)]">
      <TopBar
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: definitionName },
          { label: `Run` },
        ]}
      />

      {/* Pipeline Summary Bar */}
      <section className="px-8 py-4 bg-surface-container-low/50 border-b border-outline-variant/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <SummaryField label="Status">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs font-bold ${status.className}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dotClass}`} />
              {status.label}
            </span>
          </SummaryField>
          <SummaryField label="Branch">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">account_tree</span>
              <span className="font-semibold">{run.git_branch ?? "—"}</span>
            </div>
          </SummaryField>
          <SummaryField label="Commit">
            <span className="text-xs font-mono text-primary">
              {run.git_sha?.slice(0, 7) ?? "—"}
            </span>
          </SummaryField>
          <SummaryField label="Trigger">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                {run.trigger_type === "manual" ? "person" : "webhook"}
              </span>
              <span>{run.trigger_type}</span>
            </div>
          </SummaryField>
          <SummaryField label="Duration">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">schedule</span>
              <span>{formatDuration(run.duration_ms)}</span>
            </div>
          </SummaryField>
        </div>
        {!isTerminal && (
          <button
            disabled={isCancelling}
            onClick={() => {
              startCancelTransition(async () => {
                await cancelPipelineRun(project.id, run.id);
              });
            }}
            className="flex items-center gap-2 px-4 py-2 border border-error/30 text-error text-xs font-bold rounded hover:bg-error/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">cancel</span>
            {isCancelling ? "Cancelling..." : "Cancel Run"}
          </button>
        )}
      </section>

      {/* Split Content: Task Panel + Logs */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Panel: DAG / List */}
        <div className="h-1/2 relative bg-surface-container-low overflow-hidden border-b border-outline-variant/10 flex flex-col">
          {taskRuns.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">account_tree</span>
                <p className="text-sm text-on-surface-variant font-medium">
                  {run.status === "queued" || run.status === "created"
                    ? "Waiting for runner to claim this job..."
                    : "No tasks recorded"}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* View Tabs */}
              <div className="flex items-center gap-1 px-6 pt-3 pb-0 shrink-0">
                <ViewTab active={activeView === "dag"} icon="account_tree" label="DAG" onClick={() => setActiveView("dag")} />
                <ViewTab active={activeView === "list"} icon="list" label="List" onClick={() => setActiveView("list")} />
              </div>

              {/* View Content */}
              <div className="flex-1 overflow-auto">
                {activeView === "dag" ? (
                  <PipelineDAG
                    taskRuns={taskRuns}
                    selectedTaskId={selectedTaskId}
                    onTaskSelect={setSelectedTaskId}
                  />
                ) : (
                  <div className="p-6 space-y-3">
                    {taskRuns.map((task) => {
                      const taskStatus = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
                      const steps = stepsForTask(task.id);
                      const isSelected = selectedTaskId === task.id;
                      return (
                        <div key={task.id}>
                          <button
                            onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                            className={`w-full text-left p-4 rounded-lg transition-colors ${
                              isSelected
                                ? "bg-primary/5 ring-1 ring-primary/20"
                                : "bg-surface-container hover:bg-surface-container-high"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${taskStatus.dotClass}`} />
                                <span className="text-sm font-bold text-on-surface">{task.task_name}</span>
                                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${taskStatus.className}`}>
                                  {taskStatus.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                                <span>{steps.length} step(s)</span>
                                <span className="font-mono">{formatDuration(task.duration_ms)}</span>
                                <span className="material-symbols-outlined text-sm">
                                  {isSelected ? "expand_less" : "expand_more"}
                                </span>
                              </div>
                            </div>
                          </button>
                          {isSelected && steps.length > 0 && (
                            <div className="ml-9 mt-1 space-y-1">
                              {steps.map((step) => {
                                const stepStatus = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.pending;
                                return (
                                  <div
                                    key={step.id}
                                    className="flex items-center justify-between px-4 py-2.5 rounded-md bg-surface-container-lowest"
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className={`w-1.5 h-1.5 rounded-full ${stepStatus.dotClass}`} />
                                      <span className="text-xs font-medium text-on-surface">{step.step_name}</span>
                                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${stepStatus.className}`}>
                                        {stepStatus.label}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                                      {step.exit_code !== null && (
                                        <span className="font-mono">exit: {step.exit_code}</span>
                                      )}
                                      <span className="font-mono">{formatDuration(step.duration_ms)}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Terminal Log Viewer */}
        <div className="h-1/2 flex flex-col bg-surface-container-lowest">
          {/* Log Toolbar */}
          <div className="h-10 px-6 flex items-center justify-between bg-surface-container-lowest border-b border-outline-variant/10 shrink-0">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter">Task</span>
                <select
                  value={selectedTaskId ?? ""}
                  onChange={(e) => setSelectedTaskId(e.target.value || null)}
                  className="px-2 py-0.5 rounded-sm bg-surface-container-high text-[11px] font-medium text-on-surface border-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">All</option>
                  {taskRuns.map((t) => (
                    <option key={t.id} value={t.id}>{t.task_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter">Level</span>
                <select
                  value={logLevelFilter}
                  onChange={(e) => setLogLevelFilter(e.target.value)}
                  className="px-2 py-0.5 rounded-sm bg-surface-container-high text-[11px] font-medium text-on-surface border-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All</option>
                  <option value="error">Error</option>
                  <option value="warn">Warn</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-on-surface-variant">search</span>
                <input
                  type="text"
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder="Search logs..."
                  className="px-2 py-0.5 rounded-sm bg-surface-container-high text-[11px] font-medium text-on-surface border-none focus:ring-1 focus:ring-primary w-40 placeholder:text-on-surface-variant/30"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isTerminal && (
                <span className="flex items-center gap-1 text-[10px] text-primary font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  LIVE
                </span>
              )}
              <span className="text-[10px] text-on-surface-variant font-mono">
                {filteredLogs.length} line(s)
              </span>
            </div>
          </div>

          {/* Log Content */}
          <div className="flex-1 overflow-auto p-6 font-mono text-[13px] leading-relaxed custom-scrollbar">
            {filteredLogs.length === 0 ? (
              <p className="text-on-surface-variant/40 text-center text-xs mt-8">
                {logs.length === 0
                  ? "No logs available — waiting for runner output"
                  : "No logs match the current filter"}
              </p>
            ) : (
              <div className="space-y-0.5">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="flex gap-3">
                    <span className="text-on-surface-variant/30 select-none shrink-0">
                      {formatTime(log.timestamp)}
                    </span>
                    <span className={LOG_LEVEL_CLASS[log.level] ?? LOG_LEVEL_CLASS.info}>
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryField({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider mb-1">
        {label}
      </span>
      {children}
    </div>
  );
}

function ViewTab({
  active,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly icon: string;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs font-bold transition-colors ${
        active
          ? "bg-surface-container text-on-surface"
          : "text-on-surface-variant/60 hover:text-on-surface-variant"
      }`}
    >
      <span className="material-symbols-outlined text-sm">{icon}</span>
      {label}
    </button>
  );
}
