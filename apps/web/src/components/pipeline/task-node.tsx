"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

interface TaskNodeData {
  readonly id: string;
  readonly taskName: string;
  readonly status: string;
  readonly durationMs: number | null;
  [key: string]: unknown;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; ring: string }> = {
  success: { bg: "bg-tertiary/10", text: "text-tertiary", dot: "bg-tertiary", ring: "ring-tertiary/20" },
  failed: { bg: "bg-error/10", text: "text-error", dot: "bg-error", ring: "ring-error/20" },
  running: { bg: "bg-primary/10", text: "text-primary", dot: "bg-primary animate-pulse", ring: "ring-primary/30" },
  pending: { bg: "bg-on-surface-variant/10", text: "text-on-surface-variant", dot: "bg-on-surface-variant/40", ring: "ring-outline-variant/10" },
  skipped: { bg: "bg-on-surface-variant/10", text: "text-on-surface-variant", dot: "bg-on-surface-variant/40", ring: "ring-outline-variant/10" },
  cancelled: { bg: "bg-on-surface-variant/10", text: "text-on-surface-variant", dot: "bg-on-surface-variant/40", ring: "ring-outline-variant/10" },
};

const STATUS_LABELS: Record<string, string> = {
  success: "Success",
  failed: "Failed",
  running: "Running",
  pending: "Pending",
  skipped: "Skipped",
  cancelled: "Cancelled",
  awaiting_approval: "Approval",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function TaskNodeComponent({ data }: NodeProps) {
  const nodeData = data as TaskNodeData;
  const colors = STATUS_COLORS[nodeData.status] ?? STATUS_COLORS.pending;
  const label = STATUS_LABELS[nodeData.status] ?? nodeData.status;
  const duration = formatDuration(nodeData.durationMs);

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-outline-variant/40 !w-2 !h-2 !border-0" />
      <div
        className={`px-4 py-3 rounded-lg bg-surface-container ring-1 ${colors.ring} min-w-[200px] cursor-pointer hover:bg-surface-container-high transition-colors ${
          nodeData.status === "running" ? "shadow-md shadow-primary/10" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
            <span className="text-xs font-bold text-on-surface truncate">{nodeData.taskName}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {duration && (
              <span className="text-[10px] font-mono text-on-surface-variant">{duration}</span>
            )}
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${colors.bg} ${colors.text}`}>
              {label}
            </span>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-outline-variant/40 !w-2 !h-2 !border-0" />
    </>
  );
}

export const TaskNode = memo(TaskNodeComponent);
