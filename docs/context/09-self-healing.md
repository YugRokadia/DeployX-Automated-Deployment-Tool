# Phase 5: Self-Healing

## What Was Built

A self-healing system that continuously monitors deployed containers and automatically remediates failures. The health monitor runs as a third parallel loop on the runner alongside heartbeat and job polling. It detects unhealthy containers via dual checks (container running + HTTP probe), restarts them with exponential backoff, and auto-rollbacks to the previous revision when restarts are exhausted.

## Architecture

```
Runner (start.ts)
  ├── Heartbeat loop (every 10s)
  ├── Job poll loop (every 5s)
  └── Health Monitor loop (every 15s)
       ├── Discovery: Docker labels (deployx.role=app)
       ├── Dual check: isContainerRunning() + HTTP health probe
       ├── Sliding window: last 10 checks → aggregate health
       └── Remediation cascade:
            ├── unhealthy + restarts < 3 → docker restart (5s, 10s, 20s backoff)
            └── unhealthy + restarts >= 3 → blue-green rollback to previous image
```

## Remediation Cascade

```
Health Check Fail
  → Sliding window drops below 80% pass rate → "degraded" (logged, no action)
  → Sliding window drops below 50% pass rate → "unhealthy"
    → Restart attempt 1 (after 0s)
      → Container recovers → back to "healthy", counter resets
      → Container still unhealthy (after 5s backoff)
    → Restart attempt 2 (after 10s backoff)
      → Container still unhealthy
    → Restart attempt 3 (after 20s backoff)
      → All restarts exhausted
    → Auto-rollback: deploy previous revision image via blue-green swap
      → Success: deployment status → "rolled_back"
      → Failure: record rollback_failed event
```

## Key Design Decisions

- **`docker restart` for restarts**: Preserves container config (env, labels, ports, network). Docker's own `--restart unless-stopped` handles crashed processes; self-healing handles hung/unhealthy apps (running but not serving)
- **Sliding window** (not single check): 10-check window with 80%/50% thresholds prevents flapping — a single timeout doesn't trigger remediation
- **Discovery via Docker labels**: Monitor reads `deployx.runId`, `deployx.healthPath`, `deployx.appPort` from container labels — no API calls for configuration
- **Rollback = blue-green swap**: Starts opposite-color container with previous image, health-checks it, switches nginx, stops broken container — same flow as initial deployment
- **AbortSignal lifecycle**: Monitor cleanly stops via AbortController in the shutdown handler

## Files Created/Modified

### New Files (7)
- `apps/runner/src/deployers/sliding-window.ts` — Pure immutable sliding window data structure
- `apps/runner/src/deployers/remediation-engine.ts` — Restart/rollback cascade logic
- `apps/runner/src/deployers/health-monitor.ts` — Background monitoring loop with discovery
- `apps/web/.../healing/route.ts` — POST healing events API
- `supabase/migrations/20250406000011_healing_events.sql` — healing_events table
- 3 test files (sliding-window, remediation-engine, health-monitor)

### Modified Files (10)
- `packages/shared/src/constants.ts` — Monitor interval + probe timeout constants
- `packages/shared/src/types/enums.ts` — HealingEventType enum
- `packages/shared/src/types/database.ts` — HealingEvent interface
- `packages/shared/src/validators/deployment.ts` — RecordHealingEventSchema
- `apps/runner/src/deployers/container-manager.ts` — Added restartContainer()
- `apps/runner/src/deployers/docker-local-deployer.ts` — Added runId/healthPath/appPort labels
- `apps/runner/src/deployers/index.ts` — Re-export HealthMonitor
- `apps/runner/src/api-client.ts` — Added recordHealingEvent() method
- `apps/runner/src/commands/start.ts` — Health monitor as third parallel loop
- `apps/web/.../deployment-detail-client.tsx` — Self-healing events timeline panel

## Test Coverage

- **247 total tests** (was 188 before Phase 5)
  - Shared validators: 36 tests (+8 healing event schema tests)
  - Pipeline engine: 66 tests (unchanged)
  - Runner: 145 tests (+51 new)
    - Sliding window: 18 tests (window operations, health computation)
    - Remediation engine: 18 tests (backoff, restart, rollback cascade)
    - Health monitor: 13 tests (lifecycle, discovery, dual check, reconciliation)
    - Container manager: 26 tests (+2 restartContainer)
