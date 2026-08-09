# Phase 13: Advanced Observability & Predictive Features

## What Was Built

The capstone phase adding intelligent observability, predictive analytics, and operational features. Transforms DeployX from a CI/CD executor into an insights-driven platform with SLA tracking, alert rules, in-app notifications, audit logging, build duration prediction, failure risk scoring, build artifact storage, and a user profile page.

## Architecture

```
packages/shared/src/observability.ts   ← Pure computation (uptime, EMA, risk)
packages/shared/src/validators/        ← alert, notification, audit, profile, artifact schemas
apps/web/src/lib/audit.ts              ← Fire-and-forget audit event recording
apps/web/src/hooks/                    ← useRealtimeNotifications (Supabase Realtime)
apps/web/src/components/observability/ ← SLA ring, uptime chart, risk badge, prediction stat
apps/web/src/components/layout/        ← NotificationDropdown in TopBar
apps/web/src/app/(dashboard)/alerts/   ← Alert rules CRUD
apps/web/src/app/(dashboard)/profile/  ← User profile with inline editing
apps/web/src/app/(dashboard)/settings/audit-log/ ← Filterable audit log viewer
supabase/migrations/                   ← alert_rules, notifications, audit_events tables
```

## Database Schema

### New Enums
- `alert_severity`: info, warning, critical
- `notification_type`: alert_fired, deployment_status, pipeline_status, approval_requested, system
- `audit_action`: create, update, delete, trigger, approve, reject, rollback, login

### New Tables

**`alert_rules`** — configurable threshold-based alerts
- Metrics: success_rate, avg_duration_ms, health_check_failure_rate, deployment_health
- Operators: gt, lt, gte, lte, eq
- Per-project or org-wide scope
- Cooldown to prevent alert storms

**`notifications`** — in-app notification records
- Published to Supabase Realtime for live delivery
- User-scoped (nullable user_id for broadcasts)
- JSONB metadata for navigation links

**`audit_events`** — immutable audit trail
- Records all key actions: project CRUD, deployment stop/rollback, secret management, membership changes
- Fire-and-forget insertion (never blocks user actions)
- Filterable by resource_type, action, user, date range

### Storage Bucket
- `build-artifacts` bucket (50 MiB limit)
- Path convention: `{org_id}/{project_id}/{run_id}/{filename}`
- RLS: org members read, developers upload, admins delete

## Features

### SLA/Uptime Dashboard
Integrated as a tab in the project detail page. Computes uptime percentage from `health_check_results` over configurable windows (24h default). Status levels: met (≥99.9%), at_risk (≥99.0%), breached (<99.0%). Displays a circular SVG progress ring with color coding and a Recharts AreaChart showing hourly uptime.

### Alert Rules
Admin-only CRUD for threshold-based alerts. Each rule specifies a metric, operator, threshold, and severity. Rules can be scoped to a specific project or apply org-wide. Toggle active/inactive. Cooldown prevents re-triggering within a configurable window. Evaluated at query time (no background cron).

### In-App Notifications
Real-time notification delivery via Supabase `postgres_changes` subscription filtered by user_id. TopBar notification dropdown shows unread count badge (capped at 99+), notification list with mark-as-read, and click-to-navigate via metadata links. Paginated API endpoint for historical notifications.

### Audit Log
Immutable event trail for compliance and debugging. Records are inserted via `recordAuditEvent()` — a fire-and-forget helper that logs errors but never propagates them. Retrofitted into existing server actions: project create/delete, deployment stop/rollback, approval votes, secret management, membership changes. Filterable viewer at `/settings/audit-log` with action, resource type, and date range filters.

### Build Duration Prediction
Uses Exponential Moving Average (EMA) with α=0.3 over successful build durations. Requires minimum 5 samples. Displayed as a stat card on the project detail page with a trend indicator.

### Failure Risk Indicator
Computes recent failure rate from the last 20 pipeline runs. Categorized as: low (<30%), medium (30-60%), high (>60%). Displayed as a colored badge on the project detail page.

### Build Artifact Storage
Runners upload build artifacts to Supabase Storage via `POST /api/runner/jobs/[runId]/artifacts`. Artifacts listed with download (signed URL) and delete (admin-only) actions. Supports common extensions: .tar.gz, .zip, .jar, .war, .json, .xml, .yaml, .yml, .log, .txt, .html, .css, .js, .wasm, .bin, .deb, .rpm.

### Profile Page
User profile at `/profile` with avatar display, inline-editable display name, GitHub username, organization info, and recent activity from audit events.

## Pure Computation Functions

All in `packages/shared/src/observability.ts` — no DB dependency, maximally testable:

| Function | Purpose |
|----------|---------|
| `computeUptimePercent(checks, windowHours)` | Filter checks in window, return pass % |
| `computeSlaStatus(uptimePercent, target)` | "met" / "at_risk" / "breached" |
| `predictBuildDuration(durations, alpha?)` | EMA prediction, null if < 5 samples |
| `computeFailureRisk(runs, branch?)` | { risk, level } from recent failure rate |
| `evaluateAlertCondition(value, op, threshold)` | Pure comparison for alert evaluation |
| `formatDurationMs(ms)` | Human-readable "2m 34s", "1h 5m" |

## Key Design Decisions

1. **Pure computation in shared package** — uptime, EMA, risk scoring have zero DB dependency for maximum testability
2. **Audit as fire-and-forget** — `recordAuditEvent()` logs errors but never blocks user actions
3. **SLA as project tab** — integrated into existing project detail rather than standalone page
4. **Notifications via Realtime** — Supabase `postgres_changes` on notifications table, auto-subscribe per user
5. **Alert evaluation at query time** — evaluated when dashboard loads, not via background cron (keeps architecture simple)
6. **Storage path convention** — `{org_id}/{project_id}/{run_id}/{filename}` enables RLS via path prefix matching

## Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `SLA_DEFAULT_WINDOW_HOURS` | 24 | Default uptime calculation window |
| `SLA_UPTIME_TARGET_PERCENT` | 99.9 | SLA target threshold |
| `BUILD_PREDICTION_EMA_ALPHA` | 0.3 | EMA smoothing factor |
| `BUILD_PREDICTION_MIN_SAMPLES` | 5 | Minimum runs for prediction |
| `FAILURE_RISK_LOOKBACK_COUNT` | 20 | Runs to consider for risk |
| `FAILURE_RISK_HIGH_THRESHOLD` | 0.6 | High risk boundary |
| `FAILURE_RISK_MEDIUM_THRESHOLD` | 0.3 | Medium risk boundary |
| `ALERT_COOLDOWN_DEFAULT_MINUTES` | 15 | Default alert cooldown |
| `NOTIFICATION_PAGE_SIZE` | 20 | Notifications per page |
| `ARTIFACT_MAX_SIZE_BYTES` | 50 MiB | Max artifact upload size |

## Limitations

- Alert evaluation is on-demand (no background scheduler/cron)
- Notifications don't integrate with external channels (email, Slack)
- SLA windows are fixed (24h default), not user-configurable per project
- Artifact storage uses Supabase Storage with a 50 MiB limit per file
- Profile editing is limited to display name (avatar and email are read-only from GitHub OAuth)
- Audit log has no export functionality (CSV/JSON)
