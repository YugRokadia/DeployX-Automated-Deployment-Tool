# DeployX Demo App

A minimal Node.js/Express application that satisfies all DeployX deployment contracts. Use this as a reference when preparing your own repositories for DeployX.

## Quick Start

```bash
# Run locally
npm install
npm start
# → http://localhost:3000

# Run tests
npm test

# Build Docker image
docker build -t demo-app:latest .
docker run -p 3000:3000 demo-app:latest
```

---

## Docker Repository Guidelines

When creating a repository for DeployX, your project needs the following:

### Required Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Build instructions. Must be at the path configured in DeployX project settings (default: `./Dockerfile`) |
| `.dockerignore` | Exclude `node_modules`, `.git`, `.env*`, and large assets from the Docker build context |

### Required App Behavior

| Requirement | Why |
|-------------|-----|
| Read `PORT` from environment | DeployX runner injects the port for the container via the `PORT` env var |
| `GET /health` returns 200 | DeployX health checker polls this endpoint. Must return HTTP 200 when the app is healthy |
| Handle `SIGTERM` gracefully | Blue-green and rolling deploys send SIGTERM before stopping old containers |
| Run as non-root user | Security best practice. Use `USER node` (Node.js) or equivalent in your Dockerfile |

### Recommended Files

| File | Purpose |
|------|---------|
| `deployx.yaml` | Pipeline definition (tasks, steps, deploy config). Copy into the DeployX pipeline YAML editor |
| `test.js` | Contract tests that verify DeployX requirements (health endpoint, version, graceful shutdown) |
| `.env.example` | Document required environment variables without actual values |

### Testing Best Practices

Tests in `test.js` validate that your app satisfies DeployX deployment contracts. When writing tests:

- **Test the shape, not specific values** — e.g., assert that `version` exists and matches semver format (`/^\d+\.\d+\.\d+$/`), not that it equals `"1.0.0"`. This prevents test failures when you naturally bump your version.
- **Test contracts, not implementation** — verify `GET /health` returns 200 with `{ status: "healthy" }`, verify `PORT` is read from env, verify `SIGTERM` triggers graceful shutdown.
- **Keep tests self-contained** — the demo uses zero external dependencies for testing (just Node.js `http` module).

### Dockerfile Best Practices

- **Use alpine-based images** for smaller image size (`node:20-alpine`, `python:3.12-alpine`)
- **Multi-stage builds** for compiled languages (Go, Rust, Java) to separate build and runtime
- **Copy dependency manifests first**, install, then copy source code (leverages Docker layer caching)
- **Set `HEALTHCHECK`** instruction matching your `/health` endpoint
- **`EXPOSE`** the port your app listens on
- **Run as non-root** user (`USER node`, `USER nobody`)

---

## Using This Demo with DeployX

### Step 1: Push to GitHub

Create a new GitHub repository and push this demo app:

```bash
cd examples/demo-app
git init
git add .
git commit -m "Initial demo app"
git remote add origin https://github.com/YOUR_USER/deployx-demo.git
git push -u origin main
```

### Step 2: Create a Project in DeployX

1. Go to **Projects** → **New Project**
2. Fill in:
   - **Project Name**: `demo-app`
   - **Deploy Target**: `Docker Local`
   - **Git Repository URL**: `https://github.com/YOUR_USER/deployx-demo.git`
   - **Default Branch**: `main`
   - **Dockerfile Path**: `./Dockerfile`
   - **Build Context**: `.`
3. Click **Create Project**

### Step 3: Create a Pipeline

1. Open your new project → **Pipelines** tab
2. Click **Create Pipeline**
3. **Pipeline Name**: `demo-pipeline`
4. Paste the contents of `deployx.yaml` into the YAML editor:

```yaml
name: demo-pipeline
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
        command: docker build -t demo-app:${{ git.short_sha }} .
    deploy:
      driver: docker_local
      strategy: blue_green
      port: 3000              # Port the demo app listens on inside the container
      image: demo-app:${{ git.short_sha }}
      health_check:
        path: /health
        interval_seconds: 10
        timeout_seconds: 5
        retries: 3
        start_period_seconds: 15
```

> **Note:** `port: 3000` in the pipeline YAML is the port your application listens on inside its Docker container — not the DeployX dashboard port.

5. Click **Create Pipeline**

### Step 4: Trigger a Run

1. Click **Trigger Pipeline** on the project page
2. Watch the DAG visualization — `test` runs first, then `build` (which depends on test)
3. View real-time logs for each step
4. Once complete, the app is deployed via blue-green strategy

### Step 5: Verify Deployment

```bash
# The deployed app is accessible via the port allocated by DeployX
curl http://localhost:<allocated-port>/health
# → {"status":"healthy"}
```

---

## Pipeline YAML Reference

```yaml
name: <pipeline-name>          # 1-128 characters
tasks:
  <task-name>:                 # alphanumeric + hyphens/underscores
    depends_on: [<task>, ...]  # optional — tasks that must complete first
    approval_required: false   # optional — require manual approval
    steps:
      - name: <step-name>     # 1-128 characters
        command: <command>     # 1-4096 characters
        image: <docker-image>  # optional — run step in container
        env:                   # optional — environment variables
          KEY: value
        timeout_seconds: 3600  # optional — max 86400 (24h)
    deploy:                    # optional — deployment config
      driver: docker_local     # docker_local | railway | fly_io
      strategy: blue_green     # blue_green | canary | rolling
      port: 3000              # Your app's container port (1-65535)
      image: <image:tag>       # supports ${{ git.short_sha }} variable
      health_check:
        path: /health
        interval_seconds: 10
        timeout_seconds: 5
        retries: 3
        start_period_seconds: 15
```

### Available Variables

| Variable | Value |
|----------|-------|
| `${{ git.sha }}` | Full commit hash |
| `${{ git.short_sha }}` | 7-character commit hash |
| `${{ git.branch }}` | Branch name |
| `${{ project.name }}` | Project name |
| `${{ project.slug }}` | URL-friendly project slug |
| `${{ env.VAR_NAME }}` | Environment variable / project secret |
