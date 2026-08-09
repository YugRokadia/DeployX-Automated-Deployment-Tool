# Phase 10: Scheduled Triggers & Metrics Dashboard

## What Was Built

Four capabilities completing DeployX's trigger model and observability layer:

1. **Scheduled Triggers** — Cron-based pipeline execution with a per-project+pipeline schedule config, preset buttons (hourly/daily/weekly), and a cron API route for external invocation.
2. **Dashboard Metrics** — Real success rate and average build time on the overview dashboard, computed from the last 100 pipeline runs.
3. **Log Search** — Client-side text search in the run detail log viewer, filtering logs by message content in real-time.
4. **Health Check Chart** — Recharts `AreaChart` replacing the CSS bar chart on deployment detail, showing response times over time.

## Architecture

```
Schedule Execution Flow:
  External Cron (every minute)
    → GET /api/cron/schedules (Bearer CRON_SECRET)
      → createServiceClient() (bypass RLS)
      → Query active schedules where next_run_at <= now()
      → For each: create pipeline_run (trigger_type: "schedule")
      → Advance next_run_at using cron parser
      → Return { processed: N }

Schedule Config UI (Project Settings → Scheduled Triggers):
  → Pipeline selector + cron preset buttons + freeform cron input
  → Branch override, enable/disable toggle
  → Next run time display
  → Delete with confirmation
```

## Key Design Decisions

- **Hand-rolled cron parser**: `parseCronExpression()` + `getNextCronRun()` in shared package keeps dependency count at zero (only zod). Supports 5-field standard cron with ranges, steps, wildcards, and comma lists.
- **External cron, not internal scheduler**: The `/api/cron/schedules` route is stateless — called by an external cron service (Vercel Cron, GitHub Actions, etc.) every minute. No long-running process needed.
- **Re-compute `next_run_at` on re-activation**: When a schedule is toggled back to active, `next_run_at` is recalculated from `now()` to prevent a backlog of catch-up runs.
- **Unique constraint per project+pipeline**: `unique(project_id, pipeline_definition_id)` prevents duplicate schedules. Can be relaxed later.
- **Partial index on `next_run_at`**: `WHERE is_active = true` ensures only active schedules are indexed, keeping the cron query efficient.
- **Dashboard metrics from last 100 runs**: Success rate counts only completed runs (success + failed), not queued/running. Avg build time uses successful runs only.
- **Client-side log search**: No server round-trip — filters against already-loaded logs via `message.toLowerCase().includes(query)`.
- **Recharts AreaChart for health checks**: Smooth gradient fill, proper axes, hover tooltips. Failed checks could be highlighted with custom dot rendering in future iterations.

## Files Created/Modified

### New Files (6)
- `supabase/migrations/20250406000015_pipeline_schedules.sql` — pipeline_schedules table, indexes, RLS policies
- `packages/shared/src/validators/schedule.ts` — Cron parser, presets, `getNextCronRun()`, `describeCron()`, Zod schemas
- `packages/shared/src/validators/__tests__/schedule.test.ts` — 43 tests
- `apps/web/src/app/api/cron/schedules/route.ts` — Cron execution GET handler
- `apps/web/src/app/(dashboard)/projects/[projectId]/schedules/actions.ts` — CRUD server actions
- `apps/web/src/components/projects/schedules-section.tsx` — Schedule UI component
- `apps/web/src/components/deployment/health-check-chart.tsx` — Recharts AreaChart

### Modified Files (6)
- `packages/shared/src/types/database.ts` — Added `PipelineSchedule` interface
- `packages/shared/src/index.ts` — Exported schedule validators
- `apps/web/src/app/(dashboard)/projects/[projectId]/project-detail-client.tsx` — Added schedules prop, SchedulesSection in SettingsTab
- `apps/web/src/app/(dashboard)/projects/[projectId]/page.tsx` — Fetch pipeline_schedules
- `apps/web/src/app/(dashboard)/page.tsx` — Compute real success rate + avg build time
- `apps/web/src/app/(dashboard)/projects/[projectId]/runs/[runId]/run-detail-client.tsx` — Added log search input
- `apps/web/src/app/(dashboard)/projects/[projectId]/deployments/[deploymentId]/deployment-detail-client.tsx` — Replaced CSS bar chart with HealthCheckChart
- `apps/web/src/app/(dashboard)/projects/[projectId]/deployments/[deploymentId]/page.tsx` — Increased health check limit to 50

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid cron expression | Zod validation rejects, field error shown |
| Cron route without Bearer token | 401 Unauthorized |
| CRON_SECRET not configured | 500 Internal Server Error |
| Schedule references deleted pipeline | Skip, continue processing others |
| Duplicate schedule (project + pipeline) | 23505 → "A schedule already exists for this pipeline" |
| No current pipeline version | Skip schedule, continue others |
| Zero data for dashboard metrics | Show "—" (existing fallback) |
| Empty log search | Show all logs (no filter) |
| Zero health checks for chart | Show "No health check data yet" |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Authenticates calls to `/api/cron/schedules` |

## Trigger Type Completeness

All three trigger types are now implemented:

| Type | Phase | Mechanism |
|------|-------|-----------|
| `manual` | Phase 3 | User clicks "Trigger Pipeline" in UI |
| `webhook` | Phase 9 | GitHub push event → HMAC-verified POST |
| `schedule` | Phase 10 | External cron → Bearer-authenticated GET |

## Test Coverage

- **394 total tests** (was 351 before Phase 10)
  - Shared validators: 171 tests (+43 new: schedule parser, cron, schemas)
  - Pipeline engine: 66 tests (unchanged)
  - Runner: 145 tests (unchanged)
  - Web: 12 tests (unchanged)
