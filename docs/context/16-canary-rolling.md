# Phase 11: Canary & Rolling Deployment Strategies

## What Was Built

Two new deployment strategies beyond the existing blue-green: **canary** (staged traffic shifting with auto-rollback) and **rolling** (ordinal instance replacement with health gates). Each strategy is implemented as a separate `DeployerDriver` class, keeping the blue-green deployer unchanged. The deployer factory routes on both `deploy_target` and `strategy`. Strategy-specific UI cards visualize promotion/rollback progress.

## Architecture

```
Deployer Factory (deployer-factory.ts)
  docker_local + blue_green  → DockerLocalDeployer       (existing)
  docker_local + canary      → DockerLocalCanaryDeployer  (new)
  docker_local + rolling     → DockerLocalRollingDeployer (new)

Canary Flow:
  deploy(ctx)
    → Start canary container (deployx-{slug}-canary)
    → Health check canary
    → For each stage [10%, 25%, 50%, 100%]:
      → Calculate nginx weights (stable:canary ratio via GCD)
      → Write weighted nginx config, reload
      → Record canary_promotion healing event
      → Wait observation_seconds, health check during observation
      → If unhealthy → restore 100% stable, stop canary, record canary_rollback
    → At 100%: stop old stable, promote canary as new stable
    → Return success

Rolling Flow:
  deploy(ctx)
    → Discover existing instances (deployx-{slug}-inst-0..N-1)
    → If first deploy: start all N instances, configure nginx
    → For each ordinal 0..N-1 (respecting maxUnavailable):
      → Stop old instance, start new with updated image
      → Health check new instance
      → If unhealthy → rollback all updated instances to old image
      → Update nginx upstream, record rolling_instance_updated event
    → All updated → return success
```

## Container Naming

| Strategy | Container Names | Labels |
|----------|----------------|--------|
| Blue-Green | `deployx-{slug}-blue`, `deployx-{slug}-green` | `deployx.color=blue\|green` |
| Canary | `deployx-{slug}-stable`, `deployx-{slug}-canary` | `deployx.strategy=canary`, `deployx.canaryRole=stable\|canary` |
| Rolling | `deployx-{slug}-inst-{0,1,...N-1}` | `deployx.strategy=rolling`, `deployx.ordinal={N}` |

All containers share `deployx.role=app`, enabling discovery by the health monitor.

## Nginx Weighted Upstreams

Canary uses nginx's `weight` directive for traffic splitting:

```nginx
upstream app {
    server deployx-myapp-stable:3000 weight=9;
    server deployx-myapp-canary:3000 weight=1;  # 10% canary
}
```

Weight calculation uses GCD simplification:
- 10% → stable:9, canary:1
- 25% → stable:3, canary:1
- 50% → stable:1, canary:1
- 100% → canary only (stable removed from upstream)

Rolling uses equal-weight multi-server upstreams:
```nginx
upstream app {
    server deployx-myapp-inst-0:3000;
    server deployx-myapp-inst-1:3000;
    server deployx-myapp-inst-2:3000;
}
```

## Configuration

```yaml
# deployx.yaml — canary example
deploy:
  driver: docker_local
  strategy: canary
  canary:
    stages: [10, 25, 50, 100]       # traffic percentages
    observation_seconds: 30           # wait between stages

# deployx.yaml — rolling example
deploy:
  driver: docker_local
  strategy: rolling
  rolling:
    instances: 3                      # total instance count
    max_unavailable: 1                # replaced at a time
    observation_seconds: 15           # wait after each instance
```

Schemas: `CanaryConfigSchema` (stages 1-100, max 10 stages, observation max 600s) and `RollingConfigSchema` (instances 2-10, max_unavailable 1-5, observation max 600s).

## Healing Events

Progress is tracked via the existing `healing_events` table with JSONB `details`:

| Event Type | Details |
|-----------|---------|
| `canary_promotion` | `{ percentage: 25 }` |
| `canary_rollback` | `{ failed_at_percentage: 50 }` |
| `rolling_instance_updated` | `{ ordinal: 2, instances_total: 4 }` |
| `rolling_rollback` | `{ failed_ordinal: 2 }` |

## Health Monitor Compatibility

The health monitor discovers canary/rolling containers via the same `deployx.role=app` label. New behavior:
- Reads `deployx.strategy` label (defaults to `"blue_green"`)
- Only requires `deployx.color` for blue-green strategy
- Canary/rolling containers use a synthetic `currentColor: "blue"` for `DeploymentRef` compatibility
- `previousImageTag` is null for non-blue-green → remediation does restarts only, skips auto-rollback

## UI Visualization

Two strategy-specific cards on the deployment detail page:

**CanaryProgressCard** — Horizontal stage bar (10% → 25% → 50% → 100%) with completed/current/failed states, rollback indicator, promotion path summary.

**RollingProgressCard** — Instance grid with progress bar (N/total), per-instance status (pending/updated/failed), rollback message on failure.

## Key Design Decisions

1. **Separate deployer classes** over strategy branching — keeps each under 400 lines, single responsibility, independently testable
2. **Nginx `weight` directive** for traffic splitting — native round-robin weighting, no external load balancer
3. **In-memory promotion state** — canary stages tracked within synchronous `deploy()` call, no DB column needed
4. **Healing events for progress** — reuses existing table with JSONB details, UI reads events for visualization
5. **Ordinal-based rolling** — deterministic instance naming enables reliable nginx upstream management
6. **No DB migration for deployment table** — strategy already stored; progress lives in healing_events

## Files

| File | Role |
|------|------|
| `supabase/migrations/20250406000016_canary_rolling_events.sql` | 4 new healing_event_type enum values |
| `packages/shared/src/validators/deployment.ts` | CanaryConfigSchema, RollingConfigSchema, extended DeployConfigSchema |
| `packages/shared/src/types/enums.ts` | 4 new HealingEventType enum entries |
| `packages/shared/src/constants.ts` | Canary/rolling default constants |
| `apps/runner/src/deployers/nginx-config.ts` | WeightedUpstreamServer, generateWeightedNginxConfig, calculateCanaryWeights |
| `apps/runner/src/deployers/docker-local-canary-deployer.ts` | Canary DeployerDriver implementation |
| `apps/runner/src/deployers/docker-local-rolling-deployer.ts` | Rolling DeployerDriver implementation |
| `apps/runner/src/deployers/deployer-factory.ts` | Routes on target + strategy |
| `apps/runner/src/deployers/health-monitor.ts` | Extended discovery for non-blue-green containers |
| `apps/web/src/components/deployment/canary-progress-card.tsx` | Canary stage visualization |
| `apps/web/src/components/deployment/rolling-progress-card.tsx` | Rolling instance grid visualization |
| `apps/web/.../deployment-detail-client.tsx` | Conditional strategy card rendering |

## Test Coverage

73 new tests (394 → 467 total):
- Canary deployer: 19 tests (promotion flow, auto-rollback, healing events)
- Rolling deployer: 17 tests (instance replacement, health gates, rollback)
- Deployer factory: 6 tests (routing for all strategy combinations)
- Nginx weighted config: 13 tests (weight generation, GCD calculation)
- Health monitor: 4 tests (canary/rolling discovery, strategy defaulting)
- Deployment schemas: 15 tests (CanaryConfig, RollingConfig, extended DeployConfig, new event types)
