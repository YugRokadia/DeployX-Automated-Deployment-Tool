# Phase 4: Orchestrator (Docker-Local)

## What Was Built

The deployment orchestrator — when a pipeline task has a `deploy` config, the runner automatically deploys the built image using blue-green deployment with nginx reverse proxy.

## Architecture

```
Pipeline Executor
  └─ executeTask()
       └─ all steps pass?
            └─ deploy config present?
                 └─ executeDeployment()
                      ├─ createDeployment() → API → Supabase
                      ├─ createDeployer("docker_local")
                      └─ DockerLocalDeployer.deploy()
                           ├─ ensureNetwork("deployx-net")
                           ├─ getCurrentColor() → "blue" | "green" | null
                           ├─ runContainer(newColor)
                           ├─ waitForHealthyViaDocker(docker exec wget)
                           ├─ ensureProxyContainer(nginx)
                           ├─ writeNginxConfig → reloadNginx
                           ├─ drain + stop oldColor
                           └─ updateDeployment("active")
```

## Pipeline YAML

```yaml
tasks:
  deploy:
    depends_on: [build-image]
    steps:
      - name: Verify image
        command: docker inspect ${{ project.slug }}:${{ git.short_sha }}
    deploy:
      driver: docker_local
      strategy: blue_green
      port: 3000
      health_check:
        path: /health
        interval_seconds: 10
        retries: 3
        timeout_seconds: 5
        start_period_seconds: 15
```

## Key Design Decisions

- **Deploy at task level** (not step level): deployment runs after all build steps succeed
- **One nginx proxy per project**: persists across deployments, named `deployx-proxy-{slug}`
- **Shared Docker network** (`deployx-net`): containers communicate by name
- **Port allocation** via `~/.deployx/ports.json`: range 10000-10999
- **Container naming**: `deployx-{slug}-{blue|green}` for app, `deployx-proxy-{slug}` for nginx

## Files Created/Modified

### New Files (18)
- `packages/shared/src/validators/deployment.ts` — Zod schemas for deploy config and API payloads
- `apps/runner/src/deployers/deployer-interface.ts` — Pluggable deployer contract
- `apps/runner/src/deployers/container-manager.ts` — Docker container lifecycle
- `apps/runner/src/deployers/port-allocator.ts` — Host port management
- `apps/runner/src/deployers/nginx-config.ts` — Nginx config generation
- `apps/runner/src/deployers/health-checker.ts` — HTTP health checks with retry
- `apps/runner/src/deployers/docker-local-deployer.ts` — Blue-green orchestrator
- `apps/runner/src/deployers/deployer-factory.ts` — Factory for deployer drivers
- `apps/runner/src/deployers/index.ts` — Barrel exports
- `apps/web/.../deployments/route.ts` — POST create deployment
- `apps/web/.../deployments/[deploymentId]/route.ts` — PATCH update status
- `apps/web/.../deployments/[deploymentId]/health/route.ts` — POST health check
- `apps/web/.../deployment-detail-client.tsx` — Dashboard client component
- `apps/web/.../deployments/actions.ts` — Server actions (stop, rollback)
- 5 test files (container-manager, nginx-config, health-checker, port-allocator, deployment validators)

### Modified Files (7)
- `packages/shared/src/validators/pipeline.ts` — Added `deploy` field to TaskConfigSchema
- `packages/shared/src/constants.ts` — Deployment transitions + deployer constants
- `packages/shared/src/index.ts` — Export deployment validators
- `packages/pipeline-engine/src/state-machine.ts` — Deployment state machine
- `apps/runner/src/api-client.ts` — 3 deployment API methods
- `apps/runner/src/executor/pipeline-executor.ts` — Deploy hook after steps
- `apps/web/.../deployments/[deploymentId]/page.tsx` — Real data fetching

## Test Coverage

- **188 total tests** (was 93 before Phase 4)
  - Pipeline engine: 66 tests (13 new deployment transitions)
  - Runner: 94 tests (54 new deployer tests)
  - Shared validators: 28 tests (all new)
