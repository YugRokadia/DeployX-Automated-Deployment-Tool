# Auth Setup — Complete

## Files
| File | Purpose |
|------|---------|
| `apps/web/src/proxy.ts` | Next.js 16 proxy (was middleware.ts). Refreshes tokens via `getUser()`, protects routes, redirects. |
| `apps/web/src/lib/supabase/client.ts` | Browser client (`createBrowserClient`) for client components |
| `apps/web/src/lib/supabase/server.ts` | Server client (`createServerClient`) for server components/actions |
| `apps/web/src/app/auth/callback/route.ts` | PKCE OAuth code exchange -> session -> redirect to dashboard |
| `apps/web/src/app/(auth)/login/page.tsx` | GitHub OAuth button wired to `signInWithOAuth` |
| `apps/web/.env.local` | Supabase URL + anon key + service_role key (gitignored) |

## OAuth Flow
1. User clicks "Sign in with GitHub" on `/login`
2. `supabase.auth.signInWithOAuth({ provider: "github", scopes: "repo" })` redirects to GitHub
3. GitHub authorizes (with `repo` scope for private repo access) -> redirects to Supabase
4. Supabase redirects to `/auth/callback?code=...`
5. Route handler calls `exchangeCodeForSession(code)` -> sets session cookies
6. **Captures `provider_token`** (GitHub access token), encrypts with AES-256-GCM, stores in `github_tokens` table
7. Redirects to dashboard `/`

## GitHub Token Storage
- **Table:** `github_tokens` (one row per user, `unique(user_id)`)
- **Encryption:** AES-256-GCM using `DEPLOYX_SECRET_KEY` (same as webhook secrets)
- **Purpose:** Used for GitHub API calls (repo listing, branch listing) and private repo cloning
- **Capture point:** Auth callback via `data.session.provider_token` from `exchangeCodeForSession`
- **Helper:** `apps/web/src/lib/github.ts` → `getDecryptedGitHubToken(userId)`

## GitHub API Routes
| Route | Purpose |
|-------|---------|
| `GET /api/github/status` | Check if user has a stored GitHub token |
| `GET /api/github/repos` | List user's GitHub repos (supports `?search=` and `?page=`) |
| `GET /api/github/repos/:owner/:repo/branches` | List branches for a repo |

## Protected Routes
- `/`, `/projects/*`, `/runners/*`, `/settings/*` -> redirect to `/login` if no user
- `/login` -> redirect to `/` if user already authenticated

## Next.js 16 Notes
- `middleware.ts` renamed to `proxy.ts`, export `proxy` (not `middleware`)
- Async Request APIs: `cookies()`, `headers()` must be awaited
- `@supabase/ssr` v0.6.1 cookie pattern works identically in proxy.ts
