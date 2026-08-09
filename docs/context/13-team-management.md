# Phase 8: Team Management & RBAC Enforcement

## What Was Built

Three capabilities that complete the RBAC system:

1. **Member Management** — Real member listing from `org_memberships` + `user_profiles`, role change via dropdown, member removal with confirmation.
2. **Invite Flow** — New `org_invites` table, admin/owner can invite by email with role assignment, pending invites shown in settings, invited users see accept/decline banner.
3. **Permission Enforcement** — Application-level role checks (`hasMinRole()`) added to all server actions: pipeline create/trigger, deployment stop/rollback, approval votes, secret CRUD, run cancel.

## Architecture

```
Settings Page (Server Component)
  └── Fetches: org_memberships + user_profiles + org_invites
       └── SettingsClient (Client Component)
            ├── General Tab (org name/slug)
            ├── Members Tab
            │    ├── InviteBanner (pending invites for current user)
            │    ├── InviteForm (email + role → inviteMember action)
            │    ├── MemberRow (role badge, change role, remove)
            │    └── InviteRow (email, role, expires, cancel)
            └── Danger Tab (delete org)

Permission Enforcement (Defense in Depth)
  Layer 1: hasMinRole() in server action → clear error message
  Layer 2: RLS policy via has_org_role() → DB-level enforcement
```

## Key Design Decisions

- **Application-level permission checks**: Added `hasMinRole()` in shared code mirroring SQL `has_org_role()`. Provides clear error messages ("You don't have permission to...") instead of generic RLS rejections.
- **Invite by email (not direct add)**: Creates an invite record that the user accepts on login. No email sending required — invites are visible in the Settings page.
- **No owner promotion via role change**: Owner role can only be assigned during org creation. Prevents accidental ownership transfer.
- **Admins cannot manage other admins**: Only owners can promote to admin or remove admins. Prevents privilege escalation.
- **Server component + client component split**: Settings page converted from pure `"use client"` to server component (data fetching) + client component (interactivity). Follows the pattern used in all other pages.

## Files Created/Modified

### New Files (5)
- `supabase/migrations/20250406000013_org_invites.sql` — org_invites table + RLS policies
- `packages/shared/src/validators/membership.ts` — hasMinRole, InviteMemberSchema, UpdateRoleSchema, ROLE_HIERARCHY
- `apps/web/src/app/(dashboard)/settings/actions.ts` — inviteMember, updateMemberRole, removeMember, cancelInvite, acceptInvite, declineInvite
- `apps/web/src/app/(dashboard)/settings/settings-client.tsx` — Full interactive UI with tabs, member table, invite form, role management
- `packages/shared/src/validators/__tests__/membership.test.ts` — 30 tests

### Modified Files (7)
- `packages/shared/src/types/database.ts` — Added OrgInvite, ProjectPermission interfaces
- `packages/shared/src/index.ts` — Exported membership validators
- `apps/web/src/app/(dashboard)/settings/page.tsx` — Converted to server component, fetches members + invites
- `apps/web/.../pipelines/actions.ts` — Added hasMinRole checks to createPipelineDefinition, triggerPipelineRun
- `apps/web/.../deployments/actions.ts` — Added hasMinRole checks to stopDeployment, rollbackDeployment, submitApprovalVote
- `apps/web/.../runs/actions.ts` — Added hasMinRole check to cancelPipelineRun
- `apps/web/.../secrets/actions.ts` — Added hasMinRole checks to createSecret, updateSecret, deleteSecret

## Test Coverage

- **314 total tests** (was 284 before Phase 8)
  - Shared validators: 91 tests (+30 new: membership)
  - Pipeline engine: 66 tests (unchanged)
  - Runner: 145 tests (unchanged)
  - Web: 12 tests (unchanged)
