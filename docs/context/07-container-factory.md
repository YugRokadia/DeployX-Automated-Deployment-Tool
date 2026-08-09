# Phase 3: Container Factory

## What Changed

Replaced the Phase 2 simulated execution ("Would execute: &lt;command&gt;") with **real command execution** via execa. The runner now clones repos, runs shell commands, streams logs in real-time, handles failures, and can build/push Docker images.

## Architecture

```
start.ts (poll loop)
  └→ executePipeline()        ← NEW orchestrator
       ├→ createWorkspace()    ← git clone --depth 1
       ├→ getHeadSha()         ← git rev-parse HEAD
       ├→ resolveDAG()         ← topological sort (unchanged)
       ├→ LogStreamer           ← batched log upload (500ms / 50 lines)
       └→ for each DAG group:
            └→ Promise.all(tasks):
                 └→ for each step:
                      ├→ resolveVariables()  ← ${{ git.sha }}, ${{ env.X }}
                      └→ executeStep()       ← execa('sh', ['-c', cmd])
                           ├→ stdout → LogStreamer (info)
                           └→ stderr → LogStreamer (warn)
```

## New Files

### Runner (`apps/runner/src/`)

| File | Purpose |
|------|---------|
| `executor/pipeline-executor.ts` | Top-level orchestrator. Replaces inline `executeJob()` from `start.ts`. Creates workspace, resolves DAG, walks groups, handles failure propagation. |
| `executor/step-executor.ts` | Executes a single step via `execa('sh', ['-c', command])`. Streams stdout/stderr line-by-line to LogStreamer. Supports timeout, Docker image wrapping, env overlays. |
| `executor/variable-resolver.ts` | Pure function: resolves `${{ git.sha }}`, `${{ project.slug }}`, `${{ env.VARNAME }}` in template strings. Unknown vars left as-is with warning. |
| `executor/workspace.ts` | Creates temp directory, shallow-clones repo. Returns `{ path, cleanup() }`. Cleanup always runs in finally block. |
| `logging/log-streamer.ts` | Buffers LogEntry objects, flushes to API every 500ms or at 50 lines. API errors logged to stderr, never crash. |
| `docker/docker-client.ts` | `checkDocker()`, `buildImage()`, `pushImage()`, `generateTags()`. All via execa wrapping Docker CLI. BuildKit enabled by default. |

### Web (`apps/web/src/app/api/runner/`)

| File | Purpose |
|------|---------|
| `jobs/[runId]/images/route.ts` | POST — records a built container image in `container_images` table. |

### Shared (`packages/shared/src/validators/`)

| Change | Detail |
|--------|--------|
| `runner.ts` | Added `RecordImageSchema` (registry, repository, tag, digest?, size_bytes?) |

## Modified Files

| File | Change |
|------|--------|
| `apps/runner/src/commands/start.ts` | Removed inline `executeJob()` (~160 lines). Now imports and calls `executePipeline()`. |
| `apps/runner/src/api-client.ts` | Added `project_slug`, `dockerfile_path`, `build_context`, `deploy_target` to `JobPayload`. Added `ClaimedStepRun` nested in `ClaimedTaskRun`. Added `recordImage()` method. |
| `apps/web/src/app/api/runner/jobs/route.ts` | Extended project select to include slug, dockerfile_path, build_context, deploy_target. |
| `apps/web/src/app/api/runner/jobs/[runId]/claim/route.ts` | Now returns step_run IDs nested under task_runs. |

## Key Design Decisions

### Failure Propagation
- Step fails → remaining steps in task skipped → task marked "failed"
- Tasks in the **same** DAG group continue (they're independent)
- Tasks in **downstream** groups with failed dependencies → "skipped"
- Pipeline marked "failed" if any task failed

### Log Streaming
- LogStreamer buffers entries, flushes every 500ms or at 50 lines
- API errors are fire-and-forget (logged to stderr, never crash)
- `shutdown()` clears timer + does final flush

### Step Execution
- `execa('sh', ['-c', command])` — shell features like pipes/redirection work
- `reject: false` — never throws, caller checks exitCode
- stdout → info logs, stderr → warn logs
- Line buffering: partial lines carried across chunks

### Docker Wrapping
- If step has `image` field: `docker run --rm -v cwd:/workspace -w /workspace {image} sh -c '{command}'`
- Docker availability checked once per pipeline run, not per step
- BuildKit enabled via `DOCKER_BUILDKIT=1` env var

### Variable Interpolation
- Regex: `/\$\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g`
- Supported: `git.sha`, `git.short_sha`, `git.branch`, `project.name`, `project.slug`, `env.VARNAME`
- Unknown variables: left as-is + console.warn (don't crash)

## Tests

40 tests across 5 files (`apps/runner/src/*/__tests__/*.test.ts`):

| File | Tests | Coverage |
|------|-------|----------|
| `variable-resolver.test.ts` | 12 | All variable types, whitespace, unknown vars, empty strings |
| `workspace.test.ts` | 5 | Clone, SHA fetch/skip, cleanup on failure |
| `step-executor.test.ts` | 8 | Exit codes, streaming, timeout, Docker wrapping, env merge |
| `log-streamer.test.ts` | 7 | Batching, timer flush, shutdown, error resilience, timestamps |
| `docker-client.test.ts` | 8 | Tag generation, branch sanitization, Docker availability |

## What's NOT Done Yet (Phase 4+)

- Docker build/push is wired but not invoked from pipeline executor (no `docker-build` step type yet)
- No `recordImage()` calls from pipeline executor (needs step type detection)
- No Supabase Storage for build artifacts
- No deploy step execution (Phase 4: Orchestrator)
- No private repo auth (SSH keys / tokens)
