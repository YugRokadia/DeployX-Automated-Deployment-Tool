# Phase 12: External Deployers (Railway & Fly.io)

## What Was Built

Two external platform deployers that replace the `NotImplementedError` stubs in the deployer factory. The `RailwayDeployer` and `FlyDeployer` implement the existing `DeployerDriver` interface, deploying Docker images to Railway and Fly.io via their REST APIs. Thin API client wrappers abstract all external HTTP calls for testability.

## Architecture

```
Deployer Factory (deployer-factory.ts)
  docker_local + blue_green  → DockerLocalDeployer       (existing)
  docker_local + canary      → DockerLocalCanaryDeployer  (existing)
  docker_local + rolling     → DockerLocalRollingDeployer (existing)
  railway + blue_green       → RailwayDeployer            (new)
  fly_io + blue_green        → FlyDeployer                (new)

External deployers only support blue_green strategy.
Canary/rolling require load balancer control not exposed via external APIs.

Pipeline Executor Flow:
  1. Docker guard relaxed — only requires Docker for docker_local target
  2. Project secrets passed into DeployContext (new field)
  3. Deployer extracts API token from ctx.secrets
  4. Deploy via external REST API → poll for completion
  5. Health check via HTTP probe against public URL
  6. Report health check result to control plane
```

## API Client Wrappers

**RailwayApiClient** (`clients/railway-api-client.ts`)
- Base URL: `https://api.railway.com/v2`
- Bearer token auth
- Methods: `getProject`, `listServices`, `createService`, `createDeployment`, `getDeployment`, `cancelDeployment`, `getDeploymentLogs`
- 30s request timeout

**FlyApiClient** (`clients/fly-api-client.ts`)
- Base URL: `https://api.machines.dev/v1`
- Bearer token auth
- Methods: `getApp`, `createMachine`, `getMachine`, `updateMachine`, `stopMachine`, `destroyMachine`, `listMachines`, `waitForMachineState`, `getMachineLogs`
- 30s request timeout, 120s machine state wait

## Required Secrets

| Deploy Target | Required Secrets | Optional |
|---------------|-----------------|----------|
| Railway | `RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID` | — |
| Fly.io | `FLY_API_TOKEN` | `FLY_APP_NAME` |

Secrets are stored as encrypted project secrets in the existing `project_secrets` table. The pipeline executor fetches them once at start and passes them to deployers via `DeployContext.secrets`.

## Configuration

```yaml
# deployx.yaml — Railway
deploy:
  driver: railway
  railway:
    project_id: "proj-abc"  # or set RAILWAY_PROJECT_ID secret
    region: "us-west1"

# deployx.yaml — Fly.io
deploy:
  driver: fly_io
  fly:
    app_name: "my-app"      # or set FLY_APP_NAME secret, or defaults to project slug
    region: "iad"
    vm_size: "shared-cpu-1x" # shared-cpu-1x/2x/4x, performance-1x/2x
```

## Deploy Flows

**Railway:**
1. Extract `RAILWAY_API_TOKEN` and `RAILWAY_PROJECT_ID` from secrets
2. Find or create service named `deployx-{projectSlug}`
3. Create deployment with registry-qualified image tag
4. Poll deployment status (10s interval, 5-minute max)
5. Health check against Railway-assigned public URL
6. Return `DeployResult` with `publicUrl`

**Fly.io:**
1. Extract `FLY_API_TOKEN` from secrets
2. Derive app name from secrets, config, or project slug
3. List existing machines — update first found or create new
4. Wait for machine state `started` (3s poll, 120s max)
5. Health check against `https://{appName}.fly.dev`
6. Return `DeployResult` with `publicUrl`

## Image Registry Requirement

External deployers require registry-qualified image tags (e.g., `ghcr.io/user/app:tag`). Local-only tags like `myapp:v2` are rejected with a clear error message. Users must configure their `deployx.yaml` `deploy.image` field to reference a pushed image.

## Key Design Decisions

1. **Thin API client classes** — all external HTTP calls abstracted behind mockable classes following the `vi.mock("../container-manager")` pattern
2. **Secrets in DeployContext** — added `readonly secrets: Record<string, string>` to avoid re-fetching; pipeline executor already has them
3. **Strategy restriction at factory level** — external deployers throw for canary/rolling at `createDeployer()` before any API calls
4. **Cached API client** — deployer caches its API client after first `deploy()` for `getStatus()`/`getLogs()` within the same pipeline run
5. **No health monitor integration** — Docker label discovery doesn't apply; deploy-time health check is sufficient
6. **Relaxed Docker guard** — pipeline executor only requires Docker for `docker_local` target

## Limitations

- External deployers only support `blue_green` strategy
- Health monitoring is deploy-time only (no ongoing monitoring via HealthMonitor)
- `getStatus()`, `getHealth()`, `getLogs()` return "unknown"/empty without prior `deploy()` call
- Railway and Fly.io API endpoints may evolve — client wrappers may need updates

## Files

| File | Role |
|------|------|
| `apps/runner/src/deployers/clients/railway-api-client.ts` | Railway REST API wrapper |
| `apps/runner/src/deployers/clients/fly-api-client.ts` | Fly.io Machines API wrapper |
| `apps/runner/src/deployers/clients/index.ts` | Barrel exports |
| `apps/runner/src/deployers/railway-deployer.ts` | Railway DeployerDriver implementation |
| `apps/runner/src/deployers/fly-deployer.ts` | Fly.io DeployerDriver implementation |
| `apps/runner/src/deployers/deployer-factory.ts` | Routes railway/fly_io with strategy validation |
| `apps/runner/src/deployers/deployer-interface.ts` | Added `secrets` to DeployContext |
| `apps/runner/src/deployers/index.ts` | Added exports for new deployers |
| `apps/runner/src/executor/pipeline-executor.ts` | Passes secrets, relaxed Docker guard |
| `packages/shared/src/validators/deployment.ts` | RailwayConfigSchema, FlyConfigSchema |
| `apps/web/src/app/(dashboard)/projects/new/page.tsx` | Deploy target hint text |

## Test Coverage

59 new tests (467 → 526 total):
- Railway API client: 10 tests
- Fly.io API client: 11 tests
- Railway deployer: 12 tests
- Fly.io deployer: 13 tests
- Deployer factory: +4 (10 total)
- Deployment schemas: +9 (Railway/Fly configs)
