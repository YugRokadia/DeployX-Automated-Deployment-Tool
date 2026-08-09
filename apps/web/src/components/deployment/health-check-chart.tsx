"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface HealthCheckEntry {
  readonly id: string;
  readonly status: string;
  readonly response_time_ms: number | null;
  readonly checked_at: string;
}

interface HealthCheckChartProps {
  readonly checks: readonly HealthCheckEntry[];
}

export function HealthCheckChart({ checks }: HealthCheckChartProps) {
  if (checks.length === 0) {
    return (
      <div className="h-[120px] w-full flex items-center justify-center text-on-surface-variant/30">
        <p className="text-xs">No health check data yet</p>
      </div>
    );
  }

  const chartData = [...checks]
    .reverse()
    .map((check) => ({
      time: new Date(check.checked_at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
      responseTime: check.response_time_ms ?? 0,
      status: check.status,
    }));

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="healthGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-tertiary, #4ade80)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-tertiary, #4ade80)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="time"
          tick={{ fontSize: 9, fill: "var(--color-on-surface-variant, #94a3b8)" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 9, fill: "var(--color-on-surface-variant, #94a3b8)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}ms`}
          width={45}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--color-surface-container, #1e1e2e)",
            border: "none",
            borderRadius: "8px",
            fontSize: "11px",
            color: "var(--color-on-surface, #e0e0e0)",
          }}
          formatter={(value) => [`${value}ms`, "Response Time"]}
        />
        <Area
          type="monotone"
          dataKey="responseTime"
          stroke="var(--color-tertiary, #4ade80)"
          strokeWidth={1.5}
          fill="url(#healthGradient)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
