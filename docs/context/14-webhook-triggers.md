# Phase 9: Webhook Triggers & GitHub Integration

## What Was Built

Three capabilities that transform DeployX from manual-trigger to event-driven CI/CD:

1. **Webhook Receiver** — API route at `/api/webhooks/github/[projectId]` that accepts GitHub push events, verifies HMAC-SHA256 signatures, and triggers pipeline runs.
2. **Webhook Configuration** — Per-project webhook setup with encrypted secret, branch filter, pipeline selection, and enable/disable toggle. Managed via project Settings tab.
3. **Delivery History** — Audit log of every webhook delivery attempt with status (success, rejected, skipped, error) and link to triggered pipeline run.

## Architecture

```
GitHub Push Event
  → POST /api/webhooks/github/[projectId]
    → Fetch webhook_configs (service client, bypasses RLS)
    → Verify HMAC-SHA256 signature (constant-time comparison)
    → Parse push event (ref, sha, branch, deleted flag)
    → Match branch against branch_filter (glob patterns)
    → Find pipeline definition (configured or first)
    → Create pipeline_run (trigger_type: "webhook", git_sha, git_branch)
    → Transition to "queued"
    → Log to webhook_deliveries
    → Return 200 OK with pipeline_run_id

Project Settings → Webhooks Section
  → Enable Webhook → generates secret, encrypts with AES-256-GCM
  → Show webhook URL (copy to clipboard)
  → Regenerate secret
  → Branch filter + pipeline selection
  → Enable/disable toggle
  → Recent delivery history
```

## Key Design Decisions

- **HMAC-SHA256 with constant-time comparison**: Uses `crypto.timingSafeEqual()` to prevent timing attacks. Parses GitHub's `sha256=<hex>` format.
- **Service client for webhook route**: No user session exists during webhook delivery. Uses `createServiceClient()` to bypass RLS, matching the runner API pattern.
- **One webhook config per project (v1)**: `unique(project_id)` constraint keeps UI simple. Can be expanded later by dropping the constraint.
- **Branch filter with glob patterns**: Supports exact match (`main`), single-level wildcards (`release/*`), and deep wildcards (`feature/**`). Null/empty = all branches.
- **Delivery audit log**: Every webhook delivery is logged with status and reason, providing visibility into what happened and why.
- **Secret shown only once**: Webhook secret is returned on create/regenerate only. Stored encrypted in DB using the same AES-256-GCM system as project secrets.
- **Graceful non-error responses**: Branch-filtered events, disabled webhooks, and ping events return 200 (not 4xx) since these are expected GitHub behaviors, not errors.

## Files Created/Modified

### New Files (5)
- `supabase/migrations/20250406000014_webhook_config.sql` — webhook_configs + webhook_deliveries tables, RLS policies, indexes
- `packages/shared/src/validators/webhook.ts` — GitHubPushEventSchema, WebhookConfigSchema, extractBranchFromRef, matchesBranchFilter
- `apps/web/src/app/api/webhooks/github/[projectId]/route.ts` — Webhook receiver POST handler
- `apps/web/src/app/(dashboard)/projects/[projectId]/webhooks/actions.ts` — createWebhookConfig, deleteWebhookConfig, toggleWebhookConfig, regenerateWebhookSecret, updateWebhookConfig
- `packages/shared/src/validators/__tests__/webhook.test.ts` — 29 tests

### Modified Files (5)
- `packages/shared/src/crypto.ts` — Added verifyWebhookSignature() with HMAC-SHA256
- `packages/shared/src/types/database.ts` — Added WebhookConfig, WebhookDelivery interfaces
- `packages/shared/src/index.ts` — Exported webhook validators
- `apps/web/src/app/(dashboard)/projects/[projectId]/project-detail-client.tsx` — Added WebhooksSection to SettingsTab
- `apps/web/src/app/(dashboard)/projects/[projectId]/page.tsx` — Added webhook_configs + webhook_deliveries queries
- `packages/shared/src/validators/__tests__/crypto.test.ts` — Added 8 verifyWebhookSignature tests

## Structured Logging

The webhook handler logs every decision point to `console.log` / `console.error` with a `[webhook:<projectId>]` prefix. This ensures visibility in Vercel function logs, complementing the `webhook_deliveries` DB audit trail.

Logged events:
- Entry: event type, signature presence
- Config lookup: not found errors
- Signature verification: rejection or success
- Secret decryption: failure (no sensitive data logged)
- Ping events
- Active/disabled status
- Event type filtering
- Branch filter matching
- Pipeline lookup: found or missing
- Run creation: success with run ID, or failure
- Top-level catch: unhandled errors always logged and returned as 500

Format: `[webhook:<projectId>] <message>`

## Error Handling

| Scenario | Response |
|----------|----------|
| Missing X-Hub-Signature-256 | 401 Unauthorized |
| Invalid signature | 401 Unauthorized |
| No webhook config for project | 404 Not Found |
| Webhook config disabled | 200 `{ skipped: true }` |
| Branch filtered out | 200 `{ skipped: true, reason: "branch_filter" }` |
| Branch deletion event | 200 `{ skipped: true, reason: "branch_deletion" }` |
| No pipeline configured | 200 `{ error: "No pipeline configured" }` |
| GitHub "ping" event | 200 `{ pong: true }` |
| Pipeline run creation fails | 500 |

## Test Coverage

- **351 total tests** (was 314 before Phase 9)
  - Shared validators: 128 tests (+37 new: 29 webhook + 8 crypto HMAC)
  - Pipeline engine: 66 tests (unchanged)
  - Runner: 145 tests (unchanged)
  - Web: 12 tests (unchanged)
