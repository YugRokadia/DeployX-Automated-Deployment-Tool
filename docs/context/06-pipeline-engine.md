# Phase 2: Pipeline Engine

## Overview

Phase 2 implements the core pipeline execution backbone: YAML parsing, DAG resolution, state machine, runner CLI, runner API routes, and dashboard features for pipeline definition CRUD and triggering.

## Architecture

```
Dashboard (Next.js)
  ├── Pipeline CRUD (YAML editor → parse → store)
  ├── Trigger Pipeline (creates pipeline_run, status: created → queued)
  ├── Runner Registration (generates token → stores hash)
  └── Run Detail Page (task/step hierarchy + log viewer)

Runner CLI (Node.js)
  ├── register → exchanges token via API
  ├── start → heartbeat loop (10s) + job poll (5s)
  │     └── claim job → walk DAG → report status → stream logs
  ├── status → display config + test connectivity
  └── unregister → delete local config

API Routes (/api/runner/*)
  ├── POST /register → update pre-created runner_registrations row
  ├── POST /heartbeat → update last_heartbeat_at + status
  ├── GET  /jobs → return next queued job for runner's org
  ├── POST /jobs/[runId]/claim → atomic claim + create task_runs/step_runs
  ├── POST /jobs/[runId]/status → validate transition + update status
  └── POST /jobs/[runId]/logs → batch insert into run_logs
```

## Packages

### `@deployx/shared` (packages/shared)

- **constants.ts**: State transition maps (`VALID_PIPELINE_RUN_TRANSITIONS`, etc.) and terminal state arrays
- **validators/pipeline.ts**: Zod schemas for pipeline YAML config (`PipelineConfigSchema`, `TaskConfigSchema`, `StepConfigSchema`)
- **validators/runner.ts**: Zod schemas for runner API requests (`RegisterRunnerSchema`, `HeartbeatSchema`, `RunStatusUpdateSchema`, `BatchLogSchema`)

### `@deployx/pipeline-engine` (packages/pipeline-engine)

Pure logic, no I/O. Three modules:

- **parser.ts**: `parsePipelineYaml(yaml)` → validated `PipelineConfig`, `tryParsePipelineYaml(yaml)` → safe result
- **dag.ts**: `resolveDAG(tasks)` → `{ groups, order }` via Kahn's algorithm, `validateDAG(tasks)` → error strings
- **state-machine.ts**: `validate*Transition(from, to)`, `assert*Transition(from, to)`, `is*Terminal(status)` for pipeline/task/step

### `@deployx/runner` (apps/runner)

Node.js CLI agent:

- **cli.ts**: commander entry point with 4 subcommands
- **config.ts**: `~/.deployx/runner.json` management (0o600 permissions)
- **api-client.ts**: `RunnerApiClient` class wrapping fetch with Bearer auth
- **commands/**: register, start, status, unregister

## Runner Auth Flow

1. Admin clicks "Register Runner" in dashboard → server action generates random token
2. Token is SHA-256 hashed → stored in `runner_registrations.token_hash`
3. Plaintext token shown to admin once (copy to clipboard)
4. Runner CLI: `pnpm runner register --token TOKEN --url URL --name NAME` (from repo root)
5. Runner sends token in `Authorization: Bearer <token>` header
6. API hashes incoming token → looks up runner by `token_hash`
7. All subsequent requests use the same Bearer token

## Pipeline Definition Format (deployx.yaml)

```yaml
name: my-pipeline
tasks:
  build:
    steps:
      - name: Compile
        command: npm run build
  test:
    depends_on: [build]
    steps:
      - name: Run tests
        command: npm test
```

Fields per step: `name` (required), `command` (required), `image?`, `env?`, `timeout_seconds?`
Fields per task: `depends_on?` (string[]), `approval_required?` (boolean), `steps` (required)

## State Machine

### Pipeline Run
`created → queued → running → success|failed|cancelled|timed_out`

### Task Run
`pending → running|cancelled|skipped`, `running → success|failed|cancelled`, `awaiting_approval → running|cancelled`

### Step Run
`pending → running|cancelled|skipped`, `running → success|failed|cancelled`

## DAG Resolution

Kahn's algorithm produces parallel execution groups:
- Input: `{ build: {}, test: { depends_on: ["build"] }, lint: {} }`
- Output: `{ groups: [["build", "lint"], ["test"]], order: ["build", "lint", "test"] }`
- Tasks in the same group can run concurrently (Promise.all in runner)

## Job Claim Atomicity

```sql
UPDATE pipeline_runs SET status='running', runner_id=? WHERE id=? AND status='queued'
```
If `rowCount === 0`, another runner already claimed it → return 409 Conflict.

## Phase 2 Execution (Placeholder)

The runner walks the DAG and reports status transitions, but logs "Would execute: <command>" instead of actually running commands. Real execution comes in Phase 3.

## Dashboard Pages Added

- `/projects/[projectId]/pipelines` — list pipeline definitions
- `/projects/[projectId]/pipelines/new` — YAML editor with live validation
- `/projects/[projectId]/runs/[runId]` — run detail with task/step hierarchy + log viewer
- `/runners` — runner fleet management with registration dialog
- "Trigger Pipeline" button wired on project detail page

## File Map

```
packages/shared/src/
  constants.ts               ← transition maps + terminal states
  validators/pipeline.ts     ← PipelineConfigSchema
  validators/runner.ts       ← runner API schemas

packages/pipeline-engine/src/
  parser.ts                  ← YAML → PipelineConfig
  dag.ts                     ← Kahn's algorithm
  state-machine.ts           ← transition validation

apps/runner/src/
  cli.ts                     ← commander entry
  config.ts                  ← ~/.deployx/runner.json
  api-client.ts              ← RunnerApiClient
  commands/register.ts
  commands/start.ts          ← main poll + heartbeat loop
  commands/status.ts
  commands/unregister.ts

apps/web/src/
  lib/supabase/service.ts    ← service role client (bypasses RLS)
  lib/auth/runner.ts         ← hashToken, generateToken, authenticateRunner
  app/api/runner/
    register/route.ts
    heartbeat/route.ts
    jobs/route.ts
    jobs/[runId]/claim/route.ts
    jobs/[runId]/status/route.ts
    jobs/[runId]/logs/route.ts
  app/(dashboard)/
    runners/actions.ts       ← generateRunnerToken
    runners/register-runner-dialog.tsx
    runners/page.tsx
    projects/[projectId]/
      pipelines/actions.ts   ← createPipelineDefinition, triggerPipelineRun
      pipelines/page.tsx
      pipelines/new/page.tsx
      runs/[runId]/page.tsx
      runs/[runId]/run-detail-client.tsx

supabase/migrations/
  20250406000010_add_yaml_source.sql  ← adds yaml_source to pipeline_definition_versions
```

## Tests (53 passing)

- `packages/pipeline-engine/src/__tests__/parser.test.ts` (13 tests)
- `packages/pipeline-engine/src/__tests__/dag.test.ts` (14 tests)
- `packages/pipeline-engine/src/__tests__/state-machine.test.ts` (26 tests)

## Migration Required

Run in Supabase SQL Editor:
```sql
ALTER TABLE pipeline_definition_versions ADD COLUMN yaml_source text;
```

## Next: Phase 3 (Container Factory)

Phase 3 will replace the placeholder execution with real pipeline execution:
- Clone repositories, run commands via child processes
- Docker image build + tag + push
- Variable interpolation (`${{ git.sha }}`, `${{ env.VAR }}`)
- Log streaming (batched INSERT → Realtime)
- Build artifact upload to Supabase Storage
