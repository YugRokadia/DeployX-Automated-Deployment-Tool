# 19 — Getting Started with DeployX

> Step-by-step guide from first login to a running deployment.

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| GitHub account | DeployX uses GitHub OAuth for authentication |
| Docker | Required for Docker Local deploy target. Must be running on the runner machine |
| Supabase | Local (`npx supabase start`) or hosted project |
| Git repository | Public or private repo with a Dockerfile |

## Step 1: Sign In

1. Navigate to the DeployX dashboard:
   - **Hosted**: [`https://deployx-chi.vercel.app`](https://deployx-chi.vercel.app)
   - **Local dev**: `http://localhost:3000` (after running `pnpm dev`)
2. Click **Sign in with GitHub**
3. Authorize the GitHub OAuth app
4. DeployX automatically creates a personal organization for you on first login

> **How it works:** The `bootstrap_user_org()` PostgreSQL function (SECURITY DEFINER) atomically creates an organization and membership record, bypassing RLS to avoid chicken-and-egg problems.

## Step 2: Create a Project

Navigate to **Projects → New Project**. You'll see two tabs:

### Option A: Import from GitHub (recommended)

1. If prompted, click **Connect GitHub** to grant `repo` scope access
2. Browse or search your repositories in the picker
3. Click a repository to select it — branches are loaded automatically
4. Choose a branch, adjust the project name if needed
5. Select a deploy target and configure Dockerfile path / build context
6. Click **Create Project**

> Private repos are fully supported. DeployX stores an encrypted GitHub token and uses it for cloning.

### Option B: Enter URL manually

Switch to the **Enter URL** tab and fill in:

| Field | Description | Example |
|-------|-------------|---------|
| **Project Name** | Human-readable name. A URL slug is auto-generated. | `demo-app` |
| **Deploy Target** | Where containers run. | `Docker Local` |
| **Git Repository URL** | HTTPS URL to your Git repo. | `https://github.com/you/demo-app` |
| **Default Branch** | Branch to clone when triggering pipelines. | `main` |
| **Dockerfile Path** | Relative path to Dockerfile in repo. | `./Dockerfile` |
| **Build Context** | Docker build context directory. | `.` |

> Note: Manual URL entry only supports public repos unless a GitHub token is stored via the Import tab.

### Repository Requirements

Your repository must have:

1. **Dockerfile** at the configured path
2. **Health check endpoint** — `GET /health` returning HTTP 200
3. **PORT environment variable** — App must read its listen port from `process.env.PORT`
4. **SIGTERM handling** — Graceful shutdown for zero-downtime deploys

See `examples/demo-app/` for a complete working reference.

### Deploy Target Options

| Target | Requirements | Best For |
|--------|-------------|----------|
| **Docker Local** | Docker running on runner machine | Development, self-hosted |
| **Railway** | `RAILWAY_API_TOKEN` + `RAILWAY_PROJECT_ID` as project secrets | Cloud hosting |
| **Fly.io** | `FLY_API_TOKEN` as project secret | Edge/global deployment |

## Step 3: Create a Pipeline

1. Open your project → click **Create Pipeline** (or navigate to Pipelines → New Pipeline)
2. Enter a **Pipeline Name** (e.g., `build-and-deploy`)
3. Write or paste your pipeline YAML:

```yaml
name: build-and-deploy
tasks:
  test:
    steps:
      - name: Install dependencies
        command: npm ci
      - name: Run tests
        command: npm test

  build:
    depends_on: [test]
    steps:
      - name: Build Docker image
        command: docker build -t my-app:${{ git.short_sha }} .
    deploy:
      driver: docker_local
      strategy: blue_green
      port: 3000              # Port YOUR app listens on inside the container
      image: my-app:${{ git.short_sha }}
      health_check:
        path: /health
        interval_seconds: 10
        timeout_seconds: 5
        retries: 3
        start_period_seconds: 15
```

4. The editor validates YAML in real-time — green means valid, red shows the error
5. Click **Create Pipeline**

### Pipeline YAML Structure

- **`tasks`**: Named blocks of work. Each task has `steps` (commands to run sequentially)
- **`depends_on`**: Creates a DAG — tasks with dependencies wait for predecessors to complete
- **`deploy`**: Optional deployment config attached to a task. Triggers after all steps succeed
- **Variables**: `${{ git.sha }}`, `${{ git.short_sha }}`, `${{ git.branch }}`, `${{ project.name }}`, `${{ env.VAR }}`

## Step 4: Trigger a Pipeline Run

1. On the project page, click **Trigger Pipeline**
2. Select which pipeline definition and branch
3. The run enters `queued` → `running` states
4. Watch the **DAG visualization** — tasks light up as they execute
5. Click any task to view **real-time step logs**

### What happens under the hood

1. Run is queued in the database
2. Runner polls `/api/runner/jobs`, claims the run
3. Runner clones your repo (shallow clone of the target branch)
4. Resolves the DAG — determines which tasks can run in parallel
5. Executes steps via shell commands (`execa`)
6. If a task has `deploy` config: builds Docker image, deploys via the configured strategy
7. Health checker verifies the deployment is responsive
8. Status updates stream back to the dashboard in real-time via Supabase Realtime

## Step 5: Monitor Deployments

After a successful deployment:

- **Dashboard Overview** — See active deployments, success rates, avg build time
- **Project Detail → Deployments tab** — List of all deployments with status and health
- **Deployment Detail** — Click any deployment to see revision history, health timeline, container logs
- **SLA Tab** — Uptime tracking against 99.9% target with 24-hour rolling window

### Health Statuses

| Status | Meaning |
|--------|---------|
| `healthy` | All health checks passing |
| `degraded` | Some checks failing (below 80% success rate) |
| `unhealthy` | Most checks failing (below 50% success rate) |
| `unknown` | No health data yet |

### Self-Healing

DeployX automatically:
1. Restarts unhealthy containers (up to 3 attempts)
2. Rolls back to the previous revision if restarts fail
3. Logs all healing events for audit

## Step 6: Set Up Webhooks (Optional)

Auto-trigger pipelines on Git push:

1. Open project → **Settings** tab → **Webhooks** section
2. Click **Configure Webhook**
3. Copy the webhook URL: `https://deployx-chi.vercel.app/api/webhooks/github/<project-id>` (or `http://localhost:3000/...` for local dev)
4. In GitHub: **Settings → Webhooks → Add webhook**
   - Payload URL: the copied URL
   - Content type: `application/json`
   - Secret: generate and paste a shared secret
   - Events: select **Just the push event**
5. Save in both GitHub and DeployX
6. Optional: set a **branch filter** (e.g., `main`, `release/*`)

## Step 7: Manage Secrets

Store sensitive values (API keys, tokens) as encrypted project secrets:

1. Open project → **Settings** tab → **Secrets** section
2. Click **Add Secret**
3. Enter key name (e.g., `DATABASE_URL`) and value
4. Secrets are encrypted with AES-256-GCM and only decrypted by the runner at execution time
5. Access in pipeline YAML: `${{ env.DATABASE_URL }}`

## Step 8: Invite Team Members

1. Go to **Settings** (sidebar) → **Members** tab
2. Click **Invite Member**
3. Enter their email address
4. Select a role:

| Role | Permissions |
|------|------------|
| **Owner** | Full access, manage members, delete org |
| **Admin** | Manage projects, secrets, pipelines |
| **Developer** | Create/trigger pipelines, view deployments |
| **Viewer** | Read-only access to all resources |

---

## Multi-Runner Profiles

By default, each machine can run one runner. With multi-runner profiles, you can register and run multiple runners on the same machine — for example, one for your org and one for a friend's.

### Register Multiple Runners

```bash
# Your own org
deployx-runner register --token TOKEN_A --url https://deployx-chi.vercel.app --name my-runner

# A friend's org
deployx-runner register --token TOKEN_B --url https://deployx-chi.vercel.app --name friend-runner
```

### List All Runners

```bash
deployx-runner list
```

### Start a Specific Runner

```bash
# Terminal 1
deployx-runner start --profile my-runner

# Terminal 2
deployx-runner start --profile friend-runner
```

### Auto-Selection

When only one runner is registered, `--profile` is optional — it's auto-selected. When multiple exist, the CLI lists them and asks you to specify.

### Legacy Migration

If you registered a runner before multi-profile support, it's automatically migrated from `~/.deployx/runner.json` to `~/.deployx/runners/{name}.json` on the next command. No manual action needed.

> See [`22-multi-runner-profiles.md`](./22-multi-runner-profiles.md) for full details.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Icons show as text | Ensure Material Symbols font is loaded in `layout.tsx` `<head>` |
| Pipeline stuck in "queued" | Check that the runner is running and polling `/api/runner/jobs` |
| Health check failing | Verify your app has `GET /health` returning 200, and reads `PORT` from env |
| Webhook not triggering | Check GitHub webhook delivery logs; verify HMAC secret matches |
| Webhook "An exception occurred" | Likely a `DEPLOYX_SECRET_KEY` rotation. Regenerate webhook secret in DeployX UI, then update the secret in GitHub webhook settings |
| Test fails after version bump | Tests should assert shape (e.g., version is a semver string), not a hardcoded value like `"1.0.0"`. See `examples/demo-app/test.js` for the pattern |
| "No org found" error | Clear cookies and re-login — `bootstrap_user_org()` runs on first auth |
| Dashboard not updating in real-time | Supabase Realtime/WebSocket may not connect. Refresh the page to see current state. Verify Supabase Site URL matches your deployment URL |
