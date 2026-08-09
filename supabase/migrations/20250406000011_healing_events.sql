-- Self-healing events audit trail
-- Records every automated healing action (restart, rollback) for visibility

create type healing_event_type as enum (
  'health_degraded',
  'health_unhealthy',
  'restart_started',
  'restart_succeeded',
  'restart_failed',
  'rollback_started',
  'rollback_succeeded',
  'rollback_failed'
);

create table healing_events (
  id              uuid primary key default gen_random_uuid(),
  deployment_id   uuid not null references deployments(id) on delete cascade,
  event_type      healing_event_type not null,
  attempt_number  integer,
  container_name  text,
  details         jsonb,
  created_at      timestamptz not null default now()
);

create index idx_healing_events_deployment_ts
  on healing_events (deployment_id, created_at desc);
