# Project CRUD Wiring — Complete

## Data Flow Architecture
```
Server Component (page.tsx)
  -> requireUserWithOrg() [auth + org auto-provision]
  -> supabase.from("projects").select(...)
  -> passes data to UI components

Server Action (actions.ts)
  -> requireUserWithOrg() [auth check]
  -> Zod validation (CreateProjectSchema)
  -> supabase.from("projects").insert(...)
  -> revalidatePath + redirect
```

## Files Created/Modified
| File | Purpose |
|------|---------|
| `src/lib/auth/session.ts` | `requireUser()` and `requireUserWithOrg()` helpers |
| `src/app/(dashboard)/projects/actions.ts` | `createProject` and `deleteProject` server actions |
| `src/app/(dashboard)/projects/page.tsx` | Projects list — fetches from Supabase, renders grid |
| `src/app/(dashboard)/projects/new/page.tsx` | New project form — `useActionState` + Zod validation |
| `src/app/(dashboard)/projects/[projectId]/page.tsx` | Server component — fetches project + runs + deployments |
| `src/app/(dashboard)/projects/[projectId]/project-detail-client.tsx` | Client component — tabs, tables, stats |
| `src/app/(dashboard)/page.tsx` | Dashboard overview — fetches org stats, recent runs, deployments |

## Auto-Org Provisioning
First-time users get a personal org created automatically:
1. `requireUserWithOrg()` checks for existing org_membership
2. If none: creates organization + membership (role: owner)
3. Uses GitHub metadata for org name/slug
4. Zero-friction onboarding — users go straight to dashboard

## Form Validation
- Client: HTML5 `required` attributes for immediate feedback
- Server: Zod `CreateProjectSchema` validates all fields
- Field errors returned per-field via `ActionState.fieldErrors`
- Top-level errors for DB constraint violations (e.g., duplicate slug)

## Route Changes (from build output)
```
ƒ /                 (Dynamic — requires auth)
ƒ /projects         (Dynamic — requires auth)
ƒ /projects/[projectId]  (Dynamic — requires auth + project fetch)
○ /projects/new     (Static — client component, no server data)
```
