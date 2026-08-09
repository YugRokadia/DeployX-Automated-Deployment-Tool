# Phase 6: Observability

## What Was Built

A real-time observability layer that visualizes pipeline runs as interactive DAGs, streams logs live via Supabase Realtime, and computes project-level metrics. The run detail page now shows an interactive task dependency graph with live-updating node statuses, a live log stream with auto-scroll, and the project dashboard displays computed success rate, duration stats, and active runner count.

## Architecture

```
Run Detail Page (run-detail-client.tsx)
  ├── Summary Bar — live-updating status + duration via useRealtimeRun
  ├── Top Panel (tabbed):
  │    ├── "DAG" tab (default)
  │    │    ├── PipelineDAG → layoutDAG() → @xyflow/react
  │    │    ├── dagre computes hierarchical positions (TB layout)
  │    │    ├── Custom TaskNode with status colors + pulse animation
  │    │    └── Click node → select task → filter logs
  │    └── "List" tab → existing task/step hierarchy (preserved)
  └── Bottom Panel: Terminal log viewer
       ├── Live streaming via Supabase Realtime (run_logs INSERT)
       ├── Auto-scroll on new logs
       └── "LIVE" indicator for non-terminal runs

useRealtimeRun hook
  ├── Channel 1: pipeline_runs UPDATE (run status, duration)
  ├── Channel 2: task_runs UPDATE/INSERT (node status changes)
  ├── Channel 3: step_runs UPDATE/INSERT (step details, client-side filtered)
  └── Channel 4: run_logs INSERT (live log streaming)
  └── Auto-unsubscribe on terminal status or unmount

Project Detail Page
  └── BentoStats (now computed):
       ├── Success Rate (% from last 100 runs)
       ├── Avg Duration / P95 (from successful runs)
       ├── Active Runners (from runner_registrations)
       └── Run History Chart (recharts bar chart, last 20 runs)
```

## Key Design Decisions

- **@xyflow/react + @dagrejs/dagre**: Industry-standard React DAG visualization; dagre handles automatic hierarchical layout with `rankdir: "TB"` (top-to-bottom)
- **Supabase Realtime postgres_changes**: Already configured (migration 0009) on all required tables; zero additional infrastructure. Filter server-side where possible (`pipeline_run_id=eq.{runId}`)
- **Single useRealtimeRun hook**: Manages all 4 channels, returns merged state; auto-disables for terminal runs
- **On-demand metrics**: Computed in server component from pipeline_runs query; avoids cron complexity
- **task_runs.depends_on column**: Already stored in DB; used directly for DAG edges without re-fetching pipeline definitions
- **Tab preservation**: DAG is default view, but List tab preserved for accessibility and detail inspection
- **knownTaskIdsRef**: Ref-based tracking of task IDs for client-side step_runs filtering (step_runs table lacks pipeline_run_id)

## Files Created/Modified

### New Files (7)
- `apps/web/src/lib/dag-layout.ts` — Pure DAG layout utility (dagre → @xyflow/react nodes/edges)
- `apps/web/src/components/pipeline/task-node.tsx` — Custom @xyflow/react node with status colors
- `apps/web/src/components/pipeline/pipeline-dag.tsx` — ReactFlow wrapper with fit-view and click handling
- `apps/web/src/hooks/use-realtime-run.ts` — Supabase Realtime subscription hook (4 channels)
- `apps/web/src/components/dashboard/run-history-chart.tsx` — recharts bar chart for run durations
- `apps/web/src/lib/__tests__/dag-layout.test.ts` — 12 tests for DAG layout logic
- `apps/web/vitest.config.ts` — Vitest configuration for web app

### Modified Files (4)
- `apps/web/.../runs/[runId]/page.tsx` — Added `depends_on` to task_runs query
- `apps/web/.../runs/[runId]/run-detail-client.tsx` — Integrated DAG, tabs, realtime hook, auto-scroll, LIVE indicator
- `apps/web/.../projects/[projectId]/page.tsx` — Added metrics computation + active runners query
- `apps/web/.../projects/[projectId]/project-detail-client.tsx` — BentoStats with real data + RunHistoryChart

### Dependencies Added
- `@xyflow/react` — DAG visualization
- `@dagrejs/dagre` — Hierarchical graph layout
- `recharts` — Charts
- `vitest` (dev) — Web app testing

## Test Coverage

- **259 total tests** (was 247 before Phase 6)
  - Shared validators: 36 tests (unchanged)
  - Pipeline engine: 66 tests (unchanged)
  - Runner: 145 tests (unchanged)
  - Web: 12 tests (NEW)
    - DAG layout: 12 tests (empty input, single node, linear chain, parallel tasks, diamond graph, status passthrough, edge styles, nonexistent deps)
