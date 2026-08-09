"use client";

interface HealingEvent {
  readonly id: string;
  readonly event_type: string;
  readonly details: Record<string, unknown> | null;
  readonly created_at: string;
}

interface RollingProgressCardProps {
  readonly healingEvents: readonly HealingEvent[];
}

export function RollingProgressCard({ healingEvents }: RollingProgressCardProps) {
  const updateEvents = healingEvents.filter(
    (e) => e.event_type === "rolling_instance_updated",
  );
  const rollbackEvent = healingEvents.find(
    (e) => e.event_type === "rolling_rollback",
  );

  if (updateEvents.length === 0 && !rollbackEvent) {
    return null;
  }

  // Extract instance data from events
  const updatedOrdinals = updateEvents
    .map((e) => (e.details as Record<string, unknown>)?.ordinal as number)
    .filter((o) => typeof o === "number");

  const totalInstances = updateEvents.length > 0
    ? ((updateEvents[0].details as Record<string, unknown>)?.instances_total as number) ?? updatedOrdinals.length
    : 0;

  const failedOrdinal = rollbackEvent
    ? ((rollbackEvent.details as Record<string, unknown>)?.failed_ordinal as number) ?? null
    : null;

  const instanceCount = Math.max(totalInstances, ...updatedOrdinals.map((o) => o + 1));

  return (
    <div className="bg-surface-container-low rounded-xl ring-1 ring-outline-variant/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-primary">
            autorenew
          </span>
          <h3 className="text-sm font-bold text-on-surface">
            Rolling Update
          </h3>
          {rollbackEvent && (
            <span className="px-2 py-0.5 bg-error/10 text-error text-[10px] font-bold rounded-full">
              Rolled Back
            </span>
          )}
          {!rollbackEvent && updatedOrdinals.length >= instanceCount && instanceCount > 0 && (
            <span className="px-2 py-0.5 bg-tertiary/10 text-tertiary text-[10px] font-bold rounded-full">
              Complete
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-4">
        {/* Progress bar */}
        {instanceCount > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] text-on-surface-variant mb-1">
              <span>
                {updatedOrdinals.length}/{instanceCount} instances updated
              </span>
              <span>
                {Math.round((updatedOrdinals.length / instanceCount) * 100)}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  rollbackEvent ? "bg-error" : "bg-tertiary"
                }`}
                style={{
                  width: `${(updatedOrdinals.length / instanceCount) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Instance grid */}
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: instanceCount }, (_, i) => {
            const isUpdated = updatedOrdinals.includes(i);
            const isFailed = failedOrdinal === i;

            let bgColor = "bg-surface-container-highest";
            let textColor = "text-on-surface-variant/50";
            let icon = "pending";

            if (isUpdated && !isFailed) {
              bgColor = "bg-tertiary/10";
              textColor = "text-tertiary";
              icon = "check_circle";
            }
            if (isFailed) {
              bgColor = "bg-error/10";
              textColor = "text-error";
              icon = "error";
            }

            return (
              <div
                key={i}
                className={`${bgColor} rounded-lg p-2 flex flex-col items-center gap-1`}
              >
                <span className={`material-symbols-outlined text-sm ${textColor}`}>
                  {icon}
                </span>
                <span className={`text-[10px] font-mono ${textColor}`}>
                  inst-{i}
                </span>
              </div>
            );
          })}
        </div>

        {/* Failure info */}
        {failedOrdinal != null && (
          <div className="mt-3 text-xs text-error">
            Instance {failedOrdinal} failed health check — all updated instances rolled back
          </div>
        )}
      </div>
    </div>
  );
}
