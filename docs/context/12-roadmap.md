# DeployX Full Roadmap — Phases 1-15

## Completed Phases (1-7, 14-15)

| Phase | Name | What Was Built | Tests Added |
|-------|------|---------------|-------------|
| 1 | Foundation | Monorepo (turborepo), Supabase schema, 17 tables, 40+ RLS policies | — |
| 2 | Pipeline Engine | YAML parser (Zod), DAG resolution (Kahn's algorithm), state machine | +53 |
| 3 | Auth & Dashboard | GitHub OAuth (PKCE), org auto-provisioning, project CRUD, runner CLI | +40 |
| 4 | Container Factory | Real execution (execa), Docker BuildKit builds, log streaming, variable interpolation | +66 |
| 5 | Blue-Green Deployment | Docker-local deployer, nginx reverse proxy, health probes, port allocation | +28 |
| 6 | Self-Healing & Observability | Health monitor, remediation engine, auto-rollback, DAG viz (@xyflow/react), metrics UI | +63 |
| 7 | Secrets & Actions | AES-256-GCM secrets, cancel run, approval votes | +25 |
| 14 | UI Hardening & Demo App | Material Symbols fix, 23+ clickability fixes, RLS gaps closed, demo app, getting started guide | +168 |
| 15 | Deployment Bugfixes | Docker exec health checks, state machine fix, JSON Content-Type checks, tsup build | +138 |

**Current total: 581 tests across 41 test files, 4/4 Turborepo builds green**

### Phase 16: GitHub Repository Picker & Private Repo Support

Import GitHub repos directly from the platform (like Railway/Vercel).

**Features:**
- `repo` OAuth scope added to GitHub login for private repo access
- `provider_token` captured in auth callback, encrypted (AES-256-GCM), stored in `github_tokens` table
- GitHub API proxy routes: `/api/github/status`, `/api/github/repos`, `/api/github/repos/:owner/:repo/branches`
- Repository picker UI: search, browse, select repos with branch listing
- Tabbed "New Project" page: "Import from GitHub" (default) | "Enter URL" (manual fallback)
- `github_token_id` FK on `projects` table links project to token for cloning
- Runner clones private repos via `x-access-token:{token}@github.com` URL pattern
- Deployed to Vercel at `https://deployx-chi.vercel.app`

**Files added:** `github_tokens.sql`, `project_github_token.sql`, `github.ts`, `github-repo-picker.tsx`, `github-connect-prompt.tsx`, 3 API routes
**Files modified:** `login/page.tsx`, `auth/callback/route.ts`, `projects/new/page.tsx`, `projects/actions.ts`, `runner/jobs/route.ts`, `workspace.ts`, `pipeline-executor.ts`, `api-client.ts`, `database.ts`

---

## Remaining Phases (8-13)

### Phase 8: Team Management & RBAC Enforcement

Wire up existing RBAC infrastructure (DB tables, RLS policies, 4-role hierarchy) with API endpoints and UI.

**Features:**
- Real member listing from `org_memberships` + `user_profiles`
- Invite flow with `org_invites` table
- Role management (admin+ can change roles via dropdown)
- Member removal (admin+ can remove, owner protected)
- Permission enforcement in `triggerPipelineRun`, `rollbackDeployment`, `submitApprovalVote`, secret CRUD
- Pending invite acceptance flow for invited users

**Core Deliverable:** D1 Control Plane, Special Feature: RBAC

---

### Phase 9: Webhook Triggers & GitHub Integration

GitHub pushes automatically trigger pipeline runs.

**Features:**
- Webhook receiver (`POST /api/webhooks/github/[projectId]`)
- GitHub HMAC SHA-256 signature verification
- Push event parsing → auto-trigger matching pipeline
- Per-project webhook secret (reuses `project_secrets`)
- Webhook config UI + delivery history

**Core Deliverable:** D2 Pipeline Engine

---

### Phase 10: Scheduled Triggers & Metrics Dashboard

Cron-based pipeline scheduling + analytics dashboard using existing `pipeline_metrics` table.

**Features:**
- `pipeline_schedules` table with cron expressions
- Schedule CRUD UI with presets (hourly, daily, weekly)
- Scheduler execution via API route + external cron
- Analytics page: success rate trends, duration percentiles, MTTR
- Dashboard stat cards wired to real data
- Log search + level filter on run detail
- Health check time-series chart on deployment detail

**Core Deliverable:** D2 Pipeline Engine, D5 Observability Layer

---

### Phase 11: Canary & Rolling Deployment Strategies

Implement remaining deployment strategies via existing `DeployerDriver` interface.

**Features:**
- Canary: nginx upstream weights, staged promotion (10%→25%→50%→100%), auto-rollback
- Rolling: ordinal instance replacement, health gate between each, configurable maxUnavailable
- Strategy-specific visualization on deployment detail page
- Extended `DeployConfigSchema` with canary/rolling config fields

**Core Deliverable:** D4 Orchestrator, Special Feature: Blue-green/canary

---

### Phase 12: External Deployers (Railway & Fly.io)

Replace `NotImplementedError` stubs with real deployer drivers.

**Features:**
- `RailwayDeployer` via Railway API v2
- `FlyDeployer` via Fly Machines API
- API token credential management via project secrets
- External health checking (HTTP-only, no Docker inspect)
- Deploy target selection UI on project creation

**Core Deliverable:** D4 Orchestrator, D3 Container Factory

---

### Phase 13: Advanced Observability & Predictive Features

Capstone phase — intelligent CI/CD with operational insights.

**Features:**
- SLA/uptime dashboard from `health_check_results`
- Alert rules with configurable thresholds
- In-app notifications via Supabase Realtime
- Audit log (`audit_events` table)
- Build duration prediction (moving average)
- Failure risk indicator
- Build artifact storage (Supabase Storage)
- Profile page

**Core Deliverable:** D5 Observability Layer, Special Feature: Predictive auto-scaling

---

### Phase 14: UI Hardening, Security Patches & Demo App

Post-launch fixes and developer experience improvements.

**Features:**
- Material Symbols icon font fix (missing `<link>` tag in root layout)
- Clickability audit: 23+ dead interactive elements fixed across 8 files
- `healing_events` RLS gap closed (org-scoped SELECT/INSERT policies)
- Storage bucket policies tightened (org-scoped via `storage.foldername()`)
- Sidebar spacing aligned with stitch design reference
- Demo app (`examples/demo-app/`) — reference implementation satisfying all DeployX contracts
- Root README with quick start, architecture overview, docs index
- Getting started guide (`docs/context/19-getting-started.md`)
- Requirements info box on new project creation form

**Core Deliverable:** Developer experience, security hardening

See [20-ui-security-fixes.md](20-ui-security-fixes.md) for full details.

---

### Phase 15: Deployment Bugfixes — End-to-End Runner Pipeline ✅

Critical fixes that got the full pipeline working end-to-end (test → build → deploy → active).

**Fixes:**
- Health check DNS resolution: switched from `fetch(url)` to `docker exec wget` inside containers
- State machine error: removed redundant `running → running` status report
- JSON parse errors: API client now checks Content-Type before `.json()`, API routes wrapped in try-catch
- Build system: switched runner from `tsc` to `tsup` bundler, fixed `npx` → `pnpm runner`

**Result:** Full pipeline completes successfully. 581 tests pass (total across all packages). 4/4 packages build.

**Core Deliverable:** D4 Orchestrator (deployment actually works)

See [21-deployment-bugfixes.md](21-deployment-bugfixes.md) for full details.

---

## Test Growth

| Phase | New Tests | Running Total |
|-------|-----------|---------------|
| 7 (actual) | — | 284 |
| 14 (actual) | +168 | 452 |
| 15 (actual) | +129 | 581 |
| 8 (est.) | ~40 | ~621 |
| 9 (est.) | ~50 | ~671 |
| 10 (est.) | ~55 | ~726 |
| 11 (est.) | ~60 | ~786 |
| 12 (est.) | ~45 | ~831 |
| 13 (est.) | ~55 | ~886 |

## Dependency Graph

```
Phase 8 (RBAC) → Phase 9 (Webhooks) → Phase 10 (Schedules + Metrics)
  → Phase 11 (Canary/Rolling) → Phase 12 (Railway/Fly.io) → Phase 13 (Observability)
  → Phase 14 (UI Hardening + Demo App) → Phase 15 (Deployment Bugfixes) ✅
```
