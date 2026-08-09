// ── Types ───────────────────────────────────────────────────────

export interface SlidingWindowEntry {
  readonly passed: boolean;
  readonly timestamp: number;
}

export type AggregateHealth = "healthy" | "degraded" | "unhealthy";

export interface SlidingWindowState {
  readonly entries: readonly SlidingWindowEntry[];
  readonly windowSize: number;
}

// ── Factory ─────────────────────────────────────────────────────

export function createWindow(windowSize: number): SlidingWindowState {
  return { entries: [], windowSize };
}

// ── Operations (immutable) ──────────────────────────────────────

export function pushEntry(
  state: SlidingWindowState,
  entry: SlidingWindowEntry,
): SlidingWindowState {
  const updated = [...state.entries, entry];
  const trimmed =
    updated.length > state.windowSize
      ? updated.slice(updated.length - state.windowSize)
      : updated;

  return { ...state, entries: trimmed };
}

export function computeHealth(
  state: SlidingWindowState,
  healthyThreshold: number,
  degradedThreshold: number,
): AggregateHealth {
  // No data yet — assume healthy (freshly deployed container)
  if (state.entries.length === 0) return "healthy";

  const passRate = getPassRate(state);

  if (passRate >= healthyThreshold) return "healthy";
  if (passRate >= degradedThreshold) return "degraded";
  return "unhealthy";
}

export function getPassRate(state: SlidingWindowState): number {
  if (state.entries.length === 0) return 1;

  const passCount = state.entries.filter((e) => e.passed).length;
  return passCount / state.entries.length;
}
