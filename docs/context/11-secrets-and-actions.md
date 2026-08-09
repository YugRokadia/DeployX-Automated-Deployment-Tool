# Phase 7: Secrets, Cancel Run & Approval Wiring

## What Was Built

Three features that fill operational gaps in the platform:

1. **Project Secrets & Environment Variables** — encrypted key-value storage per project, managed via a Settings tab UI, injected into pipeline runs via `${{ env.VARNAME }}` resolution.
2. **Cancel Run** — functional cancel button on the run detail page that marks runs as cancelled and signals the runner to abort.
3. **Approval Votes** — server actions for submitting approve/reject votes on deployment approvals, with a UI card on the deployment detail page.

## Architecture

```
Project Settings (SettingsTab)
  └── Environment Variables section
       ├── Table: key, type badge (Secret/Variable), date, delete
       ├── Add form: key (UPPER_SNAKE_CASE), value (masked), is_secret toggle
       └── Server actions → encrypt → project_secrets table

Secrets Flow
  UI (createSecret action)
    → encryptSecret(value, DEPLOYX_SECRET_KEY)  [AES-256-GCM]
    → INSERT project_secrets (encrypted_value)
  Runner (GET /api/runner/jobs/:runId/secrets)
    → decryptSecret(encrypted_value, DEPLOYX_SECRET_KEY)
    → { secrets: Record<string, string> }
  Pipeline Executor
    → client.getSecrets(runId)
    → merge into variableContext.env
    → resolveVariables("${{ env.KEY }}", context) → resolved value

Cancel Run Flow
  UI (Cancel button)
    → cancelPipelineRun(projectId, runId)  [server action]
    → UPDATE pipeline_runs SET status = 'cancelled'
    → UPDATE task_runs/step_runs SET status = 'cancelled' (non-terminal)
    → Release runner
  Runner
    → checks client.getRunStatus() before each task group
    → if cancelled → log warning, break execution loop

Approval Vote Flow
  UI (Approve/Reject buttons on deployment detail)
    → submitApprovalVote(projectId, approvalId, decision)  [server action]
    → INSERT approval_votes
    → if reject → approval.status = 'rejected'
    → if approve count >= required → approval.status = 'approved'
```

## Key Design Decisions

- **Application-level encryption (not pgcrypto)**: AES-256-GCM via Node.js `crypto`. Portable across Postgres providers, no custom GUC variables. Format: `base64(iv):base64(authTag):base64(ciphertext)`
- **Secret values never returned to client**: Only key names, type, and timestamps exposed via RLS select. Decryption only in runner API endpoint (service_role)
- **DEPLOYX_SECRET_KEY env var**: Single encryption key for all secrets. SHA-256 hashed to derive 32-byte AES key. Must be set server-side
- **Cancel via status polling**: Runner calls `getRunStatus()` between task groups. No WebSocket needed — existing Realtime updates the dashboard instantly
- **Any rejection immediately rejects**: Single reject vote → approval rejected. Matches common CI/CD approval patterns (GitHub, GitLab)
- **UPPER_SNAKE_CASE key validation**: Enforced by Zod schema (`/^[A-Z_][A-Z0-9_]*$/`). Consistent with environment variable conventions

## Files Created/Modified

### New Files (7)
- `supabase/migrations/20250406000012_project_secrets.sql` — project_secrets table + RLS policies
- `packages/shared/src/crypto.ts` — AES-256-GCM encrypt/decrypt utilities
- `packages/shared/src/validators/secrets.ts` — Zod schemas for secret key/value validation
- `apps/web/src/app/(dashboard)/projects/[projectId]/secrets/actions.ts` — CRUD server actions for secrets
- `apps/web/src/app/api/runner/jobs/[runId]/secrets/route.ts` — Runner API for decrypted secrets
- `apps/web/src/app/(dashboard)/projects/[projectId]/runs/actions.ts` — cancelPipelineRun server action
- `packages/shared/src/validators/__tests__/crypto.test.ts` — 9 encryption tests
- `packages/shared/src/validators/__tests__/secrets.test.ts` — 16 validator tests

### Modified Files (8)
- `packages/shared/src/types/database.ts` — Added ProjectSecret interface
- `packages/shared/src/index.ts` — Exported crypto + secrets validators
- `apps/runner/src/api-client.ts` — Added getSecrets(), getRunStatus() methods
- `apps/runner/src/executor/pipeline-executor.ts` — Secret injection + cancellation check
- `apps/web/src/app/api/runner/jobs/[runId]/status/route.ts` — Added GET handler
- `apps/web/.../projects/[projectId]/page.tsx` — Query project_secrets, pass to client
- `apps/web/.../projects/[projectId]/project-detail-client.tsx` — SettingsTab UI, AddSecretForm
- `apps/web/.../runs/[runId]/run-detail-client.tsx` — Cancel button wiring with useTransition
- `apps/web/.../deployments/actions.ts` — Added submitApprovalVote server action
- `apps/web/.../deployments/[deploymentId]/page.tsx` — Query approval + votes
- `apps/web/.../deployments/[deploymentId]/deployment-detail-client.tsx` — ApprovalCard component

## Test Coverage

- **284 total tests** (was 259 before Phase 7)
  - Shared validators: 61 tests (+25 new: 9 crypto, 16 secrets)
  - Pipeline engine: 66 tests (unchanged)
  - Runner: 145 tests (unchanged)
  - Web: 12 tests (unchanged)
