"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface UptimeDataPoint {
  readonly hour: string;
  readonly uptime: number;
}

interface UptimeChartProps {
  readonly data: readonly UptimeDataPoint[];
}

export function UptimeChart({ data }: UptimeChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-on-surface-variant/40 text-sm">
        No uptime data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={[...data]} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
        <defs>
          <linearGradient id="uptimeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-tertiary)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-tertiary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="hour"
          tick={{ fontSize: 9, fill: "var(--color-on-surface-variant)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[90, 100]}
          tick={{ fontSize: 9, fill: "var(--color-on-surface-variant)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--color-surface-container-high)",
            border: "1px solid var(--color-outline-variant)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value: number | string | ReadonlyArray<number | string> | undefined) => [`${Number(value ?? 0).toFixed(2)}%`, "Uptime"]}
        />
        <Area
          type="monotone"
          dataKey="uptime"
          stroke="var(--color-tertiary)"
          strokeWidth={2}
          fill="url(#uptimeGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
