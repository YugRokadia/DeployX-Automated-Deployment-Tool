# Phase 15: Deployment Bugfixes — End-to-End Runner Pipeline

## What Was Fixed

Three critical bugs that prevented the runner from completing deployments end-to-end. After these fixes, the full pipeline — test, build, deploy — completes successfully.

## Bug 1: Health Check "fetch failed" — Docker DNS Resolution

**Problem:** Health checks used `fetch("http://deployx-myapp-blue:3000/health")` from the host. Docker container names are only resolvable from within the Docker network (`deployx-net`), not from the host where the runner process runs.

**Fix:** Replaced all `checkHealth(url)` / `waitForHealthy({ url })` calls with `checkHealthViaDocker(containerName, port, path)` / `waitForHealthyViaDocker({ containerName, port, path })`. These functions use `docker exec <container> wget -qO- http://localhost:<port><path>` to run the health check FROM INSIDE the container.

**Files Modified (6 production + 4 test):**
- `apps/runner/src/deployers/health-checker.ts` — Added `checkHealthViaDocker()` and `waitForHealthyViaDocker()` functions using `execa` + `docker exec wget`
- `apps/runner/src/deployers/docker-local-deployer.ts` — Switched to `waitForHealthyViaDocker` in deploy + `checkHealthViaDocker` in getHealth
- `apps/runner/src/deployers/docker-local-canary-deployer.ts` — 6 health check sites switched
- `apps/runner/src/deployers/docker-local-rolling-deployer.ts` — 4 health check sites switched
- `apps/runner/src/deployers/health-monitor.ts` — Ongoing probe switched
- `apps/runner/src/deployers/remediation-engine.ts` — Rollback health check switched
- 4 corresponding test files updated (mocks renamed)

**Not changed:** `fly-deployer.ts`, `railway-deployer.ts` — these hit public cloud URLs, not Docker container names, so the HTTP approach is correct.

## Bug 2: "Invalid pipeline transition: running → running"

**Problem:** `pipeline-executor.ts` reported `status: "running"` after deployment, but the pipeline was already in `running` state (set during claim). The state machine correctly rejected this.

**Fix:** Deleted the redundant status report (4 lines). The final `success`/`failed` status is reported separately at the end of pipeline execution.

**File Modified:**
- `apps/runner/src/executor/pipeline-executor.ts` — Removed lines 663-666

## Bug 3: Runner Getting HTML Instead of JSON from API

**Problem:** The runner's `api-client.ts` called `response.json()` unconditionally. When the Next.js dev server returned HTML error pages (e.g., during unhandled exceptions in `authenticateRunner()`), this threw `SyntaxError: Unexpected token '<'`, masking the real error.

**Fix (two layers):**
1. **Client side** — `api-client.ts` now checks `Content-Type` header before calling `.json()`. Non-JSON responses produce descriptive errors: `API error 500: expected JSON but got text/html (...)`
2. **Server side** — Added top-level try-catch to `/api/runner/jobs` and `/api/runner/heartbeat` routes so they always return JSON, never HTML

**Files Modified:**
- `apps/runner/src/api-client.ts` — Content-type check before `.json()`, better error messages
- `apps/web/src/app/api/runner/jobs/route.ts` — Top-level try-catch wrapper
- `apps/web/src/app/api/runner/heartbeat/route.ts` — Top-level try-catch wrapper

## Build System Fix (from prior session)

**Problem:** `npx @deployx/runner register` returned npm E404 — the package is `private: true`, not published.

**Fix:** Switched runner build from `tsc` to `tsup` (bundles workspace deps), added root-level `pnpm runner` convenience scripts, updated all UI/doc references from `npx @deployx/runner` to `pnpm runner`.

**Files Modified:**
- `apps/runner/package.json` — Added `"type": "module"`, switched to tsup build
- `apps/runner/tsup.config.ts` — Created (bundles `@deployx/shared` and `@deployx/pipeline-engine`)
- `package.json` (root) — Added `runner`, `runner:register`, `runner:start`, `runner:status` scripts
- UI files and docs updated to reference `pnpm runner` instead of `npx @deployx/runner`

## Test Coverage

- **253 total tests** across 19 test files (all passing)
  - Shared: 230 tests
  - Pipeline engine: 66 tests
  - Runner: 253 tests (mocks updated for ViaDocker functions)
  - Web: 10 tests

## Verification

```
pnpm build → 4/4 tasks green
pnpm test  → 253/253 tests pass
pnpm runner start → "Online — heartbeat sent."
Job found → Job claimed → DAG resolved → Job completed: success
```
