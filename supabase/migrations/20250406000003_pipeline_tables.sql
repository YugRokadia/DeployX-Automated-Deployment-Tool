-- ============================================================
-- Migration 003: Pipeline tables
-- Definitions, versions, runs, task runs, step runs.
-- ============================================================

-- Pipeline definitions (a named pipeline within a project)
create table pipeline_definitions (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects (id) on delete cascade,
  name                text not null,
  current_version_id  uuid,  -- FK added after pipeline_definition_versions exists
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (project_id, name)
);

create index idx_pipeline_definitions_project on pipeline_definitions (project_id);

-- Pipeline definition versions (versioned YAML-as-JSON)
create table pipeline_definition_versions (
  id                        uuid primary key default gen_random_uuid(),
  pipeline_definition_id    uuid not null references pipeline_definitions (id) on delete cascade,
  version                   integer not null,
  config_json               jsonb not null,
  created_by                uuid not null references auth.users (id),
  created_at                timestamptz not null default now(),

  unique (pipeline_definition_id, version)
);

create index idx_pipeline_versions_def on pipeline_definition_versions (pipeline_definition_id);

-- Add FK from pipeline_definitions to pipeline_definition_versions
alter table pipeline_definitions
  add constraint fk_current_version
  foreign key (current_version_id) references pipeline_definition_versions (id);

-- Pipeline runs (one execution of a pipeline)
create table pipeline_runs (
  id                      uuid primary key default gen_random_uuid(),
  pipeline_definition_id  uuid not null references pipeline_definitions (id) on delete cascade,
  pipeline_version_id     uuid not null references pipeline_definition_versions (id),
  project_id              uuid not null references projects (id) on delete cascade,
  status                  pipeline_run_status not null default 'created',
  trigger_type            trigger_type not null default 'manual',
  trigger_ref             text,
  git_branch              text,
  git_sha                 text,
  runner_id               uuid,  -- FK added after runner_registrations exists
  started_at              timestamptz,
  finished_at             timestamptz,
  duration_ms             integer,
  created_by              uuid not null references auth.users (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_pipeline_runs_project on pipeline_runs (project_id);
create index idx_pipeline_runs_status on pipeline_runs (status);
create index idx_pipeline_runs_created on pipeline_runs (created_at desc);

-- Task runs (one task within a pipeline run)
create table task_runs (
  id                uuid primary key default gen_random_uuid(),
  pipeline_run_id   uuid not null references pipeline_runs (id) on delete cascade,
  task_name         text not null,
  status            task_run_status not null default 'pending',
  sort_order        integer not null default 0,
  depends_on        text[] not null default '{}',
  approval_required boolean not null default false,
  started_at        timestamptz,
  finished_at       timestamptz,
  duration_ms       integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_task_runs_pipeline on task_runs (pipeline_run_id);
create index idx_task_runs_status on task_runs (status);

-- Step runs (one step within a task run)
create table step_runs (
  id            uuid primary key default gen_random_uuid(),
  task_run_id   uuid not null references task_runs (id) on delete cascade,
  step_name     text not null,
  status        step_run_status not null default 'pending',
  sort_order    integer not null default 0,
  command       text,
  exit_code     integer,
  started_at    timestamptz,
  finished_at   timestamptz,
  duration_ms   integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_step_runs_task on step_runs (task_run_id);
