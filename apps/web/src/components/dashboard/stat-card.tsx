interface StatCardProps {
  readonly label: string;
  readonly value: string;
  readonly icon: string;
  readonly accentColor: string;
  readonly trend?: { direction: "up" | "down"; value: string };
}

export function StatCard({
  label,
  value,
  icon,
  accentColor,
  trend,
}: StatCardProps) {
  return (
    <div
      className={`bg-surface-container rounded-lg p-5 flex flex-col justify-between border-l-4 border-${accentColor}`}
    >
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">
          {label}
        </span>
        <span
          className={`material-symbols-outlined text-${accentColor}/40 text-lg`}
        >
          {icon}
        </span>
      </div>
      <div className="flex items-end justify-between">
        <div className="text-3xl font-extrabold tracking-tighter">{value}</div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded ${
              trend.direction === "up"
                ? "text-error bg-error/10"
                : "text-tertiary bg-tertiary/10"
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              {trend.direction === "up" ? "trending_up" : "trending_down"}
            </span>
            {trend.value}
          </div>
        )}
      </div>
    </div>
  );
}
