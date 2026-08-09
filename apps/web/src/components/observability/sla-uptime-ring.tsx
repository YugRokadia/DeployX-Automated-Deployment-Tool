"use client";

import type { SlaStatus } from "@deployx/shared";

interface SlaUptimeRingProps {
  readonly uptimePercent: number;
  readonly slaStatus: SlaStatus;
  readonly size?: number;
}

const STATUS_COLOR: Record<SlaStatus, string> = {
  met: "var(--color-tertiary)",
  at_risk: "#ffd54f",
  breached: "var(--color-error)",
};

const STATUS_LABEL: Record<SlaStatus, string> = {
  met: "SLA Met",
  at_risk: "At Risk",
  breached: "Breached",
};

export function SlaUptimeRing({
  uptimePercent,
  slaStatus,
  size = 120,
}: SlaUptimeRingProps) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, uptimePercent));
  const dashOffset = circumference * (1 - progress / 100);
  const color = STATUS_COLOR[slaStatus];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-outline-variant)"
            strokeOpacity={0.2}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-on-surface">
            {uptimePercent.toFixed(2)}%
          </span>
        </div>
      </div>
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color }}
      >
        {STATUS_LABEL[slaStatus]}
      </span>
    </div>
  );
}
