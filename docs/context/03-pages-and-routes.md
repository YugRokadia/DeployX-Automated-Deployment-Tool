# Pages & Routes — Complete

## Route Map (from build output)
```
Route (app)
  ○ /                          Dashboard overview (static shell)
  ○ /_not-found                 404 page
  f /auth/callback              OAuth code exchange (dynamic)
  ○ /login                      GitHub OAuth login (static)
  ○ /projects                   Projects list page
  f /projects/[projectId]       Project detail (tabbed: Pipelines/Deployments/Settings)
  f /projects/[projectId]/deployments/[deploymentId]  Deployment detail
  f /projects/[projectId]/runs/[runId]                Pipeline run (DAG + logs)
  ○ /projects/new               New project form
  ○ /runners                    Runners management
  ○ /settings                   Org settings (tabbed: General/Members/Danger Zone)

f Proxy (Middleware) — auth proxy active
○ Static  f Dynamic
```

## Route Groups
- `(auth)` — Login page, no sidebar layout
- `(dashboard)` — All dashboard pages, sidebar + top bar layout

## Stitch Conversion Status
All 10 screens converted from Stitch HTML to React:
1. Login Page -> `(auth)/login/page.tsx`
2. Dashboard Overview -> `(dashboard)/page.tsx` (layout only, via root)
3. Projects List -> `(dashboard)/projects/page.tsx`
4. New Project Form -> `(dashboard)/projects/new/page.tsx`
5. Project Detail -> `(dashboard)/projects/[projectId]/page.tsx`
6. Pipeline Run (DAG+Logs) -> `(dashboard)/projects/[projectId]/runs/[runId]/page.tsx`
7. Deployment Detail -> `(dashboard)/projects/[projectId]/deployments/[deploymentId]/page.tsx`
8. Runners -> `(dashboard)/runners/page.tsx`
9. Org Settings -> `(dashboard)/settings/page.tsx`
10. Approval Dialog -> `components/deployment/approval-dialog.tsx`

## Shared Layout Components
- `components/layout/sidebar.tsx` — 240px fixed sidebar with nav links
- `components/layout/top-bar.tsx` — h-14 top bar with breadcrumbs, search, notifications
- `components/projects/project-card.tsx` — Reusable project card with status borders

## Data Status
All pages currently use static/placeholder data. Will be wired to Supabase after migrations (Task #12) and CRUD (Task #13).
