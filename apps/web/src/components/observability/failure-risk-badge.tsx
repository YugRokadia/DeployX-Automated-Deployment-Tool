"use client";

interface FailureRiskBadgeProps {
  readonly level: "low" | "medium" | "high";
  readonly risk: number;
}

const LEVEL_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-tertiary/10", text: "text-tertiary", label: "Low Risk" },
  medium: { bg: "bg-[#ffd54f]/10", text: "text-[#ffd54f]", label: "Medium Risk" },
  high: { bg: "bg-error/10", text: "text-error", label: "High Risk" },
};

export function FailureRiskBadge({ level, risk }: FailureRiskBadgeProps) {
  const style = LEVEL_STYLE[level] ?? LEVEL_STYLE.low;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span className="material-symbols-outlined text-sm">
        {level === "high" ? "error" : level === "medium" ? "warning" : "check_circle"}
      </span>
      {style.label} ({Math.round(risk * 100)}%)
    </span>
  );
}
