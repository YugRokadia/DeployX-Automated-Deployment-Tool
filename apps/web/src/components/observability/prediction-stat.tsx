"use client";

import { formatDurationMs } from "@deployx/shared";

interface PredictionStatProps {
  readonly predictedMs: number | null;
  readonly actualAvgMs: number | null;
}

export function PredictionStat({
  predictedMs,
  actualAvgMs,
}: PredictionStatProps) {
  if (predictedMs === null) {
    return (
      <div className="border border-outline-variant/10 rounded-lg p-4">
        <p className="text-xs text-on-surface-variant/50 mb-1">
          Predicted Build Time
        </p>
        <p className="text-lg font-semibold text-on-surface-variant/40">—</p>
        <p className="text-[10px] text-on-surface-variant/30 mt-1">
          Needs 5+ builds
        </p>
      </div>
    );
  }

  const trend =
    actualAvgMs !== null && actualAvgMs > 0
      ? ((predictedMs - actualAvgMs) / actualAvgMs) * 100
      : null;

  return (
    <div className="border border-outline-variant/10 rounded-lg p-4">
      <p className="text-xs text-on-surface-variant/50 mb-1">
        Predicted Build Time
      </p>
      <p className="text-lg font-semibold text-on-surface">
        {formatDurationMs(predictedMs)}
      </p>
      {trend !== null && (
        <p
          className={`text-[10px] mt-1 flex items-center gap-0.5 ${
            trend > 5
              ? "text-error"
              : trend < -5
                ? "text-tertiary"
                : "text-on-surface-variant/40"
          }`}
        >
          <span className="material-symbols-outlined text-xs">
            {trend > 5
              ? "trending_up"
              : trend < -5
                ? "trending_down"
                : "trending_flat"}
          </span>
          {Math.abs(trend).toFixed(0)}% vs avg
        </p>
      )}
    </div>
  );
}
