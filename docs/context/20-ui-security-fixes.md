# 20 — UI & Security Fixes (Phase 14)

> Post-launch hardening: icon rendering, interactive element audit, RLS gaps, storage policy tightening.

---

## What Was Fixed

### 1. Material Symbols Icon Font

**Problem:** All Material Symbols icons rendered as plain text (e.g., "rocket_launch" instead of the icon glyph). The Google Fonts icon font was never loaded.

**Root Cause:** `next/font/google` does not support icon fonts. The `<link>` tag for Material Symbols was missing from the root layout.

**Fix:** Added font link to `apps/web/src/app/layout.tsx`:

```tsx
<head>
  <link
    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
    rel="stylesheet"
  />
</head>
```

### 2. Clickability Audit — 23+ Dead Elements

**Problem:** Buttons with no `onClick`, links with no `href`, table rows with `cursor-pointer` but no click handler. Users click and nothing happens.

**Strategy:** Wire up navigation where routes exist, remove placeholder elements that have no backend, disable incomplete features with visual indication.

| Element | File | Fix |
|---------|------|-----|
| Pipeline runs table rows | `components/dashboard/pipeline-runs-table.tsx` | Wrapped in `<Link>` to `/projects/{id}/runs/{runId}` |
| "View All" button | `components/dashboard/pipeline-runs-table.tsx` | Changed to `<Link href="/projects">` |
| Deployment health cards | `components/dashboard/deployment-health-cards.tsx` | Wrapped in `<Link>` to `/projects/{id}/deployments/{depId}` |
| "New Pipeline" button (dashboard) | `app/(dashboard)/page.tsx` | Changed to `<Link href="/projects">` |
| "Filters" button (dashboard) | `app/(dashboard)/page.tsx` | Removed (no filtering backend) |
| Filter/Sort bar (projects) | `app/(dashboard)/projects/page.tsx` | Removed entire section (All/Production/Staging tabs, Filter, Sort) |
| SSO button (login) | `app/(auth)/login/page.tsx` | Removed (no SSO implementation) |
| Support button (login) | `app/(auth)/login/page.tsx` | Removed |
| Footer links (login) | `app/(auth)/login/page.tsx` | Made non-interactive (plain text) |
| Help button (top bar) | `components/layout/top-bar.tsx` | Removed |
| "Delete Org" button | `app/(dashboard)/settings/settings-client.tsx` | Added `disabled` + `opacity-50 cursor-not-allowed` + `title="Coming soon"` |
| Pipeline chevron icon | `app/(dashboard)/projects/[projectId]/pipelines/page.tsx` | Replaced with Active/Draft status label |

**Data flow changes:**
- `page.tsx` (dashboard) now passes `project_id` to both `PipelineRunsTable` and `DeploymentHealthCards` components
- Both components added `project_id` to their row interfaces

### 3. Sidebar Spacing

**Problem:** Navigation items were cramped compared to the stitch design reference.

**Fix:** Aligned spacing in `components/layout/sidebar.tsx`:
- Nav items: `gap-3 px-3 py-2` → `gap-4 px-6 py-3`
- Profile link: updated to `gap-4 px-4 py-3 rounded-lg`
- Removed redundant `px-3` from nav container

### 4. `healing_events` Table Missing RLS

**Problem:** The `healing_events` table had no Row Level Security policies. Any authenticated user could read/write healing events for any organization's deployments.

**Fix:** Migration `20250406000020_healing_events_rls.sql`:

```sql
ALTER TABLE healing_events ENABLE ROW LEVEL SECURITY;

-- SELECT: users can read healing events for their org's deployments
CREATE POLICY healing_events_select ON healing_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deployments d
      JOIN projects p ON p.id = d.project_id
      JOIN org_memberships om ON om.org_id = p.org_id
      WHERE d.id = healing_events.deployment_id
        AND om.user_id = auth.uid()
    )
  );

-- INSERT: users can create healing events for their org's deployments
CREATE POLICY healing_events_insert ON healing_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deployments d
      JOIN projects p ON p.id = d.project_id
      JOIN org_memberships om ON om.org_id = p.org_id
      WHERE d.id = healing_events.deployment_id
        AND om.user_id = auth.uid()
    )
  );
```

### 5. Storage Bucket Policies Overly Permissive

**Problem:** The `pipeline-artifacts` and `build-logs` storage buckets had policies allowing any authenticated user to read/delete any organization's files.

**Fix:** Migration `20250406000021_storage_rls_tighten.sql`:
- Dropped all existing permissive policies
- Created org-scoped policies using `storage.foldername(name)[1] = om.org_id::text`
- Objects must be stored under `<org_id>/...` path prefix
- Only org members can SELECT, INSERT, or DELETE objects in their org's folder

---

## Pending Migrations

Users must run these migrations (in order) in the Supabase SQL editor:

1. `20250406000020_healing_events_rls.sql` — Healing events RLS
2. `20250406000021_storage_rls_tighten.sql` — Storage policy tightening

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/app/layout.tsx` | Added Material Symbols font `<link>` in `<head>` |
| `apps/web/src/components/dashboard/pipeline-runs-table.tsx` | Added `project_id` to interface, wrapped rows in `<Link>`, "View All" → Link |
| `apps/web/src/components/dashboard/deployment-health-cards.tsx` | Added `project_id` to interface, wrapped cards in `<Link>` |
| `apps/web/src/app/(dashboard)/page.tsx` | Pass `project_id` to components, "New Pipeline" → Link, removed "Filters" |
| `apps/web/src/app/(dashboard)/projects/page.tsx` | Removed filter/sort bar section |
| `apps/web/src/app/(auth)/login/page.tsx` | Removed SSO/Support buttons, de-interactivized footer |
| `apps/web/src/components/layout/top-bar.tsx` | Removed help button |
| `apps/web/src/app/(dashboard)/settings/settings-client.tsx` | Disabled "Delete Org" button |
| `apps/web/src/app/(dashboard)/projects/[projectId]/pipelines/page.tsx` | Chevron → status label |
| `apps/web/src/components/layout/sidebar.tsx` | Wider spacing on nav items |
| `supabase/migrations/20250406000020_healing_events_rls.sql` | Healing events RLS policies |
| `supabase/migrations/20250406000021_storage_rls_tighten.sql` | Org-scoped storage policies |

---

## Design Principle

> Every interactive-looking element must either navigate somewhere, perform an action, or be visually disabled with explanation. No element should have `cursor-pointer` + hover effects without a handler.
