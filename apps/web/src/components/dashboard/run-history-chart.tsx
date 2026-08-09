"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface RunHistoryEntry {
  readonly id: string;
  readonly status: string;
  readonly duration_ms: number | null;
  readonly created_at: string;
}

interface RunHistoryChartProps {
  readonly runs: readonly RunHistoryEntry[];
}

const STATUS_COLORS: Record<string, string> = {
  success: "var(--color-tertiary, #4ade80)",
  failed: "var(--color-error, #f87171)",
  running: "var(--color-primary, #60a5fa)",
  cancelled: "var(--color-outline-variant, #94a3b8)",
  timed_out: "var(--color-error, #f87171)",
};

const DEFAULT_COLOR = "var(--color-outline-variant, #94a3b8)";

export function RunHistoryChart({ runs }: RunHistoryChartProps) {
  const chartData = runs
    .filter((r) => r.duration_ms != null)
    .slice(0, 20)
    .reverse()
    .map((r) => ({
      name: new Date(r.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      duration: Math.round((r.duration_ms as number) / 1000),
      status: r.status,
    }));

  if (chartData.length === 0) return null;

  return (
    <div className="mt-8 p-6 bg-surface-container-low rounded-xl ring-1 ring-outline-variant/10">
      <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-6">
        Run Duration History
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "var(--color-on-surface-variant, #94a3b8)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--color-on-surface-variant, #94a3b8)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}s`}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface-container, #1e1e2e)",
              border: "none",
              borderRadius: "8px",
              fontSize: "11px",
              color: "var(--color-on-surface, #e0e0e0)",
            }}
            formatter={(value) => [`${value}s`, "Duration"]}
          />
          <Bar dataKey="duration" radius={[4, 4, 0, 0]} maxBarSize={32}>
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={STATUS_COLORS[entry.status] ?? DEFAULT_COLOR}
                fillOpacity={0.8}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
