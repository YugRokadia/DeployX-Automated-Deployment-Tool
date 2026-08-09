-- ============================================================
-- Migration 005: Observability tables
-- Run logs, health check results, pipeline metrics.
-- ============================================================

-- Run logs (structured log entries from pipeline execution)
create table run_logs (
  id                uuid primary key default gen_random_uuid(),
  pipeline_run_id   uuid not null references pipeline_runs (id) on delete cascade,
  task_run_id       uuid references task_runs (id) on delete cascade,
  step_run_id       uuid references step_runs (id) on delete cascade,
  level             log_level not null default 'info',
  message           text not null,
  timestamp         timestamptz not null default now(),
  metadata          jsonb
);

-- Partition-friendly indexes for log queries
create index idx_run_logs_pipeline_ts on run_logs (pipeline_run_id, timestamp);
create index idx_run_logs_task on run_logs (task_run_id) where task_run_id is not null;
create index idx_run_logs_step on run_logs (step_run_id) where step_run_id is not null;
create index idx_run_logs_level on run_logs (level) where level in ('warn', 'error');

-- Health check results (time-series probes)
create table health_check_results (
  id                uuid primary key default gen_random_uuid(),
  deployment_id     uuid not null references deployments (id) on delete cascade,
  status            text not null check (status in ('pass', 'fail')),
  response_time_ms  integer,
  status_code       integer,
  error_message     text,
  checked_at        timestamptz not null default now()
);

create index idx_health_checks_deployment_ts on health_check_results (deployment_id, checked_at desc);

-- Pipeline metrics (aggregated stats, computed by edge function cron)
create table pipeline_metrics (
  id                          uuid primary key default gen_random_uuid(),
  project_id                  uuid not null references projects (id) on delete cascade,
  period_start                timestamptz not null,
  period_end                  timestamptz not null,
  total_runs                  integer not null default 0,
  successful_runs             integer not null default 0,
  failed_runs                 integer not null default 0,
  success_rate                numeric(5,2),
  avg_duration_ms             integer,
  p50_duration_ms             integer,
  p95_duration_ms             integer,
  deploy_count                integer not null default 0,
  rollback_count              integer not null default 0,
  mttr_ms                     integer,
  created_at                  timestamptz not null default now()
);

create index idx_pipeline_metrics_project_period on pipeline_metrics (project_id, period_start desc);
