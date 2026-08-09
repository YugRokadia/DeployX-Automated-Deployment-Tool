"use client";

interface HealingEvent {
  readonly id: string;
  readonly event_type: string;
  readonly details: Record<string, unknown> | null;
  readonly created_at: string;
}

interface CanaryProgressCardProps {
  readonly healingEvents: readonly HealingEvent[];
}

export function CanaryProgressCard({ healingEvents }: CanaryProgressCardProps) {
  const promotionEvents = healingEvents.filter(
    (e) => e.event_type === "canary_promotion",
  );
  const rollbackEvent = healingEvents.find(
    (e) => e.event_type === "canary_rollback",
  );

  if (promotionEvents.length === 0 && !rollbackEvent) {
    return null;
  }

  const completedPercentages = promotionEvents
    .map((e) => (e.details as Record<string, unknown>)?.percentage as number)
    .filter((p) => typeof p === "number")
    .sort((a, b) => a - b);

  const failedPercentage = rollbackEvent
    ? ((rollbackEvent.details as Record<string, unknown>)?.failed_at_percentage as number) ?? null
    : null;

  // Default stages for visualization
  const stages = [10, 25, 50, 100];

  return (
    <div className="bg-surface-container-low rounded-xl ring-1 ring-outline-variant/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-primary">
            tune
          </span>
          <h3 className="text-sm font-bold text-on-surface">
            Canary Promotion
          </h3>
          {rollbackEvent && (
            <span className="px-2 py-0.5 bg-error/10 text-error text-[10px] font-bold rounded-full">
              Rolled Back
            </span>
          )}
          {!rollbackEvent && completedPercentages.includes(100) && (
            <span className="px-2 py-0.5 bg-tertiary/10 text-tertiary text-[10px] font-bold rounded-full">
              Complete
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-4">
        {/* Stage progress bar */}
        <div className="flex items-center gap-1 mb-3">
          {stages.map((stage) => {
            const isCompleted = completedPercentages.includes(stage);
            const isFailed = failedPercentage === stage;
            const isCurrent =
              !isCompleted &&
              !isFailed &&
              stage ===
                stages.find((s) => !completedPercentages.includes(s));

            let bgColor = "bg-surface-container-highest";
            if (isCompleted) bgColor = "bg-tertiary";
            if (isFailed) bgColor = "bg-error";
            if (isCurrent) bgColor = "bg-primary/30";

            return (
              <div key={stage} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full h-2 rounded-full ${bgColor} transition-colors`}
                />
                <span
                  className={`text-[10px] font-mono ${
                    isCompleted
                      ? "text-tertiary font-bold"
                      : isFailed
                        ? "text-error font-bold"
                        : "text-on-surface-variant/50"
                  }`}
                >
                  {stage}%
                </span>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 text-xs text-on-surface-variant">
          {completedPercentages.length > 0 && (
            <span>
              Promoted through:{" "}
              {completedPercentages.map((p) => `${p}%`).join(" → ")}
            </span>
          )}
          {failedPercentage && (
            <span className="text-error">
              Failed at {failedPercentage}% traffic
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
