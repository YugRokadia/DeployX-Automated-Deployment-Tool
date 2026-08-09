-- ============================================================
-- Migration 001: Custom enum types
-- All enums used across the DeployX schema.
-- ============================================================

create type org_role as enum ('owner', 'admin', 'developer', 'viewer');

create type pipeline_run_status as enum (
  'created', 'queued', 'running', 'success', 'failed', 'cancelled', 'timed_out'
);

create type task_run_status as enum (
  'pending', 'running', 'success', 'failed', 'cancelled', 'skipped', 'awaiting_approval'
);

create type step_run_status as enum (
  'pending', 'running', 'success', 'failed', 'cancelled', 'skipped'
);

create type deployment_status as enum (
  'pending', 'deploying', 'active', 'draining', 'stopped', 'rolled_back', 'failed'
);

create type deployment_strategy as enum ('blue_green', 'canary', 'rolling');

create type health_status as enum ('healthy', 'degraded', 'unhealthy', 'unknown');

create type runner_status as enum ('online', 'offline', 'busy');

create type log_level as enum ('debug', 'info', 'warn', 'error');

create type deploy_target as enum ('docker_local', 'railway', 'fly_io');

create type trigger_type as enum ('manual', 'webhook', 'schedule');

create type approval_status as enum ('pending', 'approved', 'rejected');

create type approval_decision as enum ('approve', 'reject');
-- ============================================================
-- Migration 002: Core tables
-- Organizations, memberships, user profiles, projects.
-- ============================================================

-- Organizations
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_organizations_slug on organizations (slug);

-- Organization memberships (join table: users <-> orgs)
create table org_memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        org_role not null default 'viewer',
  created_at  timestamptz not null default now(),

  unique (org_id, user_id)
);

create index idx_org_memberships_org on org_memberships (org_id);
create index idx_org_memberships_user on org_memberships (user_id);

-- User profiles (extends auth.users with app-specific fields)
create table user_profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text not null,
  avatar_url      text,
  github_username text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Projects
create table projects (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  name            text not null,
  slug            text not null,
  git_repo_url    text not null,
  default_branch  text not null default 'main',
  dockerfile_path text not null default './Dockerfile',
  build_context   text not null default '.',
  deploy_target   deploy_target not null default 'docker_local',
  created_by      uuid not null references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (org_id, slug)
);

create index idx_projects_org on projects (org_id);
create index idx_projects_created_by on projects (created_by);
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
-- ============================================================
-- Migration 004: Deployment tables
-- Deployments, revisions, container images.
-- ============================================================

-- Deployments
create table deployments (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects (id) on delete cascade,
  pipeline_run_id       uuid references pipeline_runs (id),
  status                deployment_status not null default 'pending',
  strategy              deployment_strategy not null default 'blue_green',
  deploy_target         deploy_target not null default 'docker_local',
  current_revision_id   uuid,  -- FK added after deployment_revisions exists
  health_status         health_status not null default 'unknown',
  created_by            uuid not null references auth.users (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_deployments_project on deployments (project_id);
create index idx_deployments_status on deployments (status);

-- Deployment revisions (version history for rollback)
create table deployment_revisions (
  id                uuid primary key default gen_random_uuid(),
  deployment_id     uuid not null references deployments (id) on delete cascade,
  revision_number   integer not null,
  image_tag         text not null,
  image_digest      text,
  status            deployment_status not null default 'pending',
  rollback_reason   text,
  created_at        timestamptz not null default now(),

  unique (deployment_id, revision_number)
);

create index idx_deployment_revisions_deployment on deployment_revisions (deployment_id);

-- Add FK from deployments to deployment_revisions
alter table deployments
  add constraint fk_current_revision
  foreign key (current_revision_id) references deployment_revisions (id);

-- Container images (build artifacts)
create table container_images (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects (id) on delete cascade,
  pipeline_run_id   uuid references pipeline_runs (id),
  registry          text not null,
  repository        text not null,
  tag               text not null,
  digest            text,
  size_bytes        bigint,
  created_at        timestamptz not null default now()
);

create index idx_container_images_project on container_images (project_id);
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
-- ============================================================
-- Migration 006: RBAC, approval gates, and runners
-- Project permissions, deployment approvals, approval votes,
-- runner registrations.
-- ============================================================

-- Runner registrations
create table runner_registrations (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  name              text not null,
  token_hash        text not null unique,
  status            runner_status not null default 'offline',
  current_job_id    uuid,
  last_heartbeat_at timestamptz,
  system_info       jsonb,
  capabilities      text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_runners_org on runner_registrations (org_id);
create index idx_runners_status on runner_registrations (status);

-- Add FK from pipeline_runs.runner_id to runner_registrations
alter table pipeline_runs
  add constraint fk_runner
  foreign key (runner_id) references runner_registrations (id);

-- Project permissions (fine-grained per-project RBAC)
create table project_permissions (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects (id) on delete cascade,
  user_id               uuid not null references auth.users (id) on delete cascade,
  can_trigger_pipeline  boolean not null default false,
  can_approve_deploy    boolean not null default false,
  can_rollback          boolean not null default false,
  can_edit_pipeline     boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (project_id, user_id)
);

create index idx_project_permissions_project on project_permissions (project_id);
create index idx_project_permissions_user on project_permissions (user_id);

-- Deployment approvals (gate before production deploy)
create table deployment_approvals (
  id                    uuid primary key default gen_random_uuid(),
  task_run_id           uuid not null references task_runs (id) on delete cascade unique,
  required_approvals    integer not null default 1,
  status                approval_status not null default 'pending',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Approval votes
create table approval_votes (
  id            uuid primary key default gen_random_uuid(),
  approval_id   uuid not null references deployment_approvals (id) on delete cascade,
  user_id       uuid not null references auth.users (id),
  decision      approval_decision not null,
  comment       text,
  created_at    timestamptz not null default now(),

  unique (approval_id, user_id)
);

create index idx_approval_votes_approval on approval_votes (approval_id);
-- ============================================================
-- Migration 007: Helper functions and triggers
-- - is_org_member(): RLS helper
-- - auto-update updated_at trigger
-- - auto-compute duration_ms on run completion
-- - auto-create user_profile on signup
-- ============================================================

-- --------------------------------------------------------
-- Helper: Check if current user is a member of an org
-- Used by RLS policies across all org-scoped tables.
-- --------------------------------------------------------
create or replace function is_org_member(check_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_memberships
    where org_id = check_org_id
      and user_id = auth.uid()
  );
$$;

-- Helper: Check if current user has a specific role (or higher)
create or replace function has_org_role(check_org_id uuid, min_role org_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_memberships
    where org_id = check_org_id
      and user_id = auth.uid()
      and (
        case min_role
          when 'viewer' then role in ('viewer', 'developer', 'admin', 'owner')
          when 'developer' then role in ('developer', 'admin', 'owner')
          when 'admin' then role in ('admin', 'owner')
          when 'owner' then role = 'owner'
        end
      )
  );
$$;

-- --------------------------------------------------------
-- Trigger: Auto-update updated_at on row modification
-- --------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply to all tables with updated_at
create trigger trg_organizations_updated_at before update on organizations
  for each row execute function set_updated_at();

create trigger trg_user_profiles_updated_at before update on user_profiles
  for each row execute function set_updated_at();

create trigger trg_projects_updated_at before update on projects
  for each row execute function set_updated_at();

create trigger trg_pipeline_definitions_updated_at before update on pipeline_definitions
  for each row execute function set_updated_at();

create trigger trg_pipeline_runs_updated_at before update on pipeline_runs
  for each row execute function set_updated_at();

create trigger trg_task_runs_updated_at before update on task_runs
  for each row execute function set_updated_at();

create trigger trg_step_runs_updated_at before update on step_runs
  for each row execute function set_updated_at();

create trigger trg_deployments_updated_at before update on deployments
  for each row execute function set_updated_at();

create trigger trg_runner_registrations_updated_at before update on runner_registrations
  for each row execute function set_updated_at();

create trigger trg_project_permissions_updated_at before update on project_permissions
  for each row execute function set_updated_at();

create trigger trg_deployment_approvals_updated_at before update on deployment_approvals
  for each row execute function set_updated_at();

-- --------------------------------------------------------
-- Trigger: Auto-compute duration_ms when a run finishes
-- --------------------------------------------------------
create or replace function compute_duration_ms()
returns trigger
language plpgsql
as $$
begin
  if new.finished_at is not null and new.started_at is not null and old.finished_at is null then
    new.duration_ms = extract(epoch from (new.finished_at - new.started_at)) * 1000;
  end if;
  return new;
end;
$$;

create trigger trg_pipeline_runs_duration before update on pipeline_runs
  for each row execute function compute_duration_ms();

create trigger trg_task_runs_duration before update on task_runs
  for each row execute function compute_duration_ms();

create trigger trg_step_runs_duration before update on step_runs
  for each row execute function compute_duration_ms();

-- --------------------------------------------------------
-- Trigger: Auto-create user_profile on new auth.users signup
-- --------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, display_name, avatar_url, github_username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'user_name', 'User'),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'user_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- --------------------------------------------------------
-- Function: Generate a URL-safe slug from a name
-- --------------------------------------------------------
create or replace function generate_slug(input_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(regexp_replace(trim(input_name), '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
$$;
-- ============================================================
-- Migration 008: Row Level Security policies
-- Every table gets RLS enabled.
-- Access scoped to org membership using is_org_member().
-- ============================================================

-- ===================== ORGANIZATIONS =====================
alter table organizations enable row level security;

create policy "org_members_can_read_org"
  on organizations for select
  using (is_org_member(id));

create policy "owners_can_update_org"
  on organizations for update
  using (has_org_role(id, 'owner'));

-- Insert: anyone can create an org (they become owner via app logic)
create policy "authenticated_can_create_org"
  on organizations for insert
  with check (auth.uid() is not null);

-- ===================== ORG MEMBERSHIPS =====================
alter table org_memberships enable row level security;

create policy "org_members_can_read_memberships"
  on org_memberships for select
  using (is_org_member(org_id));

create policy "admins_can_insert_memberships"
  on org_memberships for insert
  with check (has_org_role(org_id, 'admin'));

create policy "admins_can_update_memberships"
  on org_memberships for update
  using (has_org_role(org_id, 'admin'));

create policy "admins_can_delete_memberships"
  on org_memberships for delete
  using (has_org_role(org_id, 'admin'));

-- ===================== USER PROFILES =====================
alter table user_profiles enable row level security;

-- Everyone can read profiles (for display names/avatars in UI)
create policy "anyone_can_read_profiles"
  on user_profiles for select
  using (true);

-- Users can only update their own profile
create policy "users_can_update_own_profile"
  on user_profiles for update
  using (id = auth.uid());

-- Insert handled by trigger (handle_new_user), allow service role
create policy "service_can_insert_profiles"
  on user_profiles for insert
  with check (true);

-- ===================== PROJECTS =====================
alter table projects enable row level security;

create policy "org_members_can_read_projects"
  on projects for select
  using (is_org_member(org_id));

create policy "developers_can_create_projects"
  on projects for insert
  with check (has_org_role(org_id, 'developer'));

create policy "developers_can_update_projects"
  on projects for update
  using (has_org_role(org_id, 'developer'));

create policy "admins_can_delete_projects"
  on projects for delete
  using (has_org_role(org_id, 'admin'));

-- ===================== PIPELINE DEFINITIONS =====================
alter table pipeline_definitions enable row level security;

create policy "org_members_can_read_pipeline_defs"
  on pipeline_definitions for select
  using (
    exists (
      select 1 from projects p
      where p.id = project_id and is_org_member(p.org_id)
    )
  );

create policy "developers_can_manage_pipeline_defs"
  on pipeline_definitions for insert
  with check (
    exists (
      select 1 from projects p
      where p.id = project_id and has_org_role(p.org_id, 'developer')
    )
  );

create policy "developers_can_update_pipeline_defs"
  on pipeline_definitions for update
  using (
    exists (
      select 1 from projects p
      where p.id = project_id and has_org_role(p.org_id, 'developer')
    )
  );

-- ===================== PIPELINE DEFINITION VERSIONS =====================
alter table pipeline_definition_versions enable row level security;

create policy "org_members_can_read_pipeline_versions"
  on pipeline_definition_versions for select
  using (
    exists (
      select 1 from pipeline_definitions pd
      join projects p on p.id = pd.project_id
      where pd.id = pipeline_definition_id and is_org_member(p.org_id)
    )
  );

create policy "developers_can_create_pipeline_versions"
  on pipeline_definition_versions for insert
  with check (
    exists (
      select 1 from pipeline_definitions pd
      join projects p on p.id = pd.project_id
      where pd.id = pipeline_definition_id and has_org_role(p.org_id, 'developer')
    )
  );

-- ===================== PIPELINE RUNS =====================
alter table pipeline_runs enable row level security;

create policy "org_members_can_read_runs"
  on pipeline_runs for select
  using (
    exists (
      select 1 from projects p
      where p.id = project_id and is_org_member(p.org_id)
    )
  );

create policy "developers_can_create_runs"
  on pipeline_runs for insert
  with check (
    exists (
      select 1 from projects p
      where p.id = project_id and has_org_role(p.org_id, 'developer')
    )
  );

-- Runners update run status via service_role, but allow org members to cancel
create policy "developers_can_update_runs"
  on pipeline_runs for update
  using (
    exists (
      select 1 from projects p
      where p.id = project_id and has_org_role(p.org_id, 'developer')
    )
  );

-- ===================== TASK RUNS =====================
alter table task_runs enable row level security;

create policy "org_members_can_read_task_runs"
  on task_runs for select
  using (
    exists (
      select 1 from pipeline_runs pr
      join projects p on p.id = pr.project_id
      where pr.id = pipeline_run_id and is_org_member(p.org_id)
    )
  );

create policy "developers_can_manage_task_runs"
  on task_runs for all
  using (
    exists (
      select 1 from pipeline_runs pr
      join projects p on p.id = pr.project_id
      where pr.id = pipeline_run_id and has_org_role(p.org_id, 'developer')
    )
  );

-- ===================== STEP RUNS =====================
alter table step_runs enable row level security;

create policy "org_members_can_read_step_runs"
  on step_runs for select
  using (
    exists (
      select 1 from task_runs tr
      join pipeline_runs pr on pr.id = tr.pipeline_run_id
      join projects p on p.id = pr.project_id
      where tr.id = task_run_id and is_org_member(p.org_id)
    )
  );

create policy "developers_can_manage_step_runs"
  on step_runs for all
  using (
    exists (
      select 1 from task_runs tr
      join pipeline_runs pr on pr.id = tr.pipeline_run_id
      join projects p on p.id = pr.project_id
      where tr.id = task_run_id and has_org_role(p.org_id, 'developer')
    )
  );

-- ===================== DEPLOYMENTS =====================
alter table deployments enable row level security;

create policy "org_members_can_read_deployments"
  on deployments for select
  using (
    exists (
      select 1 from projects p
      where p.id = project_id and is_org_member(p.org_id)
    )
  );

create policy "developers_can_create_deployments"
  on deployments for insert
  with check (
    exists (
      select 1 from projects p
      where p.id = project_id and has_org_role(p.org_id, 'developer')
    )
  );

create policy "developers_can_update_deployments"
  on deployments for update
  using (
    exists (
      select 1 from projects p
      where p.id = project_id and has_org_role(p.org_id, 'developer')
    )
  );

-- ===================== DEPLOYMENT REVISIONS =====================
alter table deployment_revisions enable row level security;

create policy "org_members_can_read_revisions"
  on deployment_revisions for select
  using (
    exists (
      select 1 from deployments d
      join projects p on p.id = d.project_id
      where d.id = deployment_id and is_org_member(p.org_id)
    )
  );

create policy "developers_can_manage_revisions"
  on deployment_revisions for all
  using (
    exists (
      select 1 from deployments d
      join projects p on p.id = d.project_id
      where d.id = deployment_id and has_org_role(p.org_id, 'developer')
    )
  );

-- ===================== CONTAINER IMAGES =====================
alter table container_images enable row level security;

create policy "org_members_can_read_images"
  on container_images for select
  using (
    exists (
      select 1 from projects p
      where p.id = project_id and is_org_member(p.org_id)
    )
  );

create policy "developers_can_manage_images"
  on container_images for all
  using (
    exists (
      select 1 from projects p
      where p.id = project_id and has_org_role(p.org_id, 'developer')
    )
  );

-- ===================== RUN LOGS =====================
alter table run_logs enable row level security;

create policy "org_members_can_read_logs"
  on run_logs for select
  using (
    exists (
      select 1 from pipeline_runs pr
      join projects p on p.id = pr.project_id
      where pr.id = pipeline_run_id and is_org_member(p.org_id)
    )
  );

-- Insert: service_role (runner) inserts logs; also allow developers
create policy "developers_can_insert_logs"
  on run_logs for insert
  with check (
    exists (
      select 1 from pipeline_runs pr
      join projects p on p.id = pr.project_id
      where pr.id = pipeline_run_id and has_org_role(p.org_id, 'developer')
    )
  );

-- ===================== HEALTH CHECK RESULTS =====================
alter table health_check_results enable row level security;

create policy "org_members_can_read_health_checks"
  on health_check_results for select
  using (
    exists (
      select 1 from deployments d
      join projects p on p.id = d.project_id
      where d.id = deployment_id and is_org_member(p.org_id)
    )
  );

create policy "developers_can_insert_health_checks"
  on health_check_results for insert
  with check (
    exists (
      select 1 from deployments d
      join projects p on p.id = d.project_id
      where d.id = deployment_id and has_org_role(p.org_id, 'developer')
    )
  );

-- ===================== PIPELINE METRICS =====================
alter table pipeline_metrics enable row level security;

create policy "org_members_can_read_metrics"
  on pipeline_metrics for select
  using (
    exists (
      select 1 from projects p
      where p.id = project_id and is_org_member(p.org_id)
    )
  );

-- Insert: edge function (service_role) aggregates metrics
create policy "service_can_insert_metrics"
  on pipeline_metrics for insert
  with check (true);

-- ===================== RUNNER REGISTRATIONS =====================
alter table runner_registrations enable row level security;

create policy "org_members_can_read_runners"
  on runner_registrations for select
  using (is_org_member(org_id));

create policy "admins_can_manage_runners"
  on runner_registrations for all
  using (has_org_role(org_id, 'admin'));

-- ===================== PROJECT PERMISSIONS =====================
alter table project_permissions enable row level security;

create policy "org_members_can_read_permissions"
  on project_permissions for select
  using (
    exists (
      select 1 from projects p
      where p.id = project_id and is_org_member(p.org_id)
    )
  );

create policy "admins_can_manage_permissions"
  on project_permissions for all
  using (
    exists (
      select 1 from projects p
      where p.id = project_id and has_org_role(p.org_id, 'admin')
    )
  );

-- ===================== DEPLOYMENT APPROVALS =====================
alter table deployment_approvals enable row level security;

create policy "org_members_can_read_approvals"
  on deployment_approvals for select
  using (
    exists (
      select 1 from task_runs tr
      join pipeline_runs pr on pr.id = tr.pipeline_run_id
      join projects p on p.id = pr.project_id
      where tr.id = task_run_id and is_org_member(p.org_id)
    )
  );

create policy "developers_can_manage_approvals"
  on deployment_approvals for all
  using (
    exists (
      select 1 from task_runs tr
      join pipeline_runs pr on pr.id = tr.pipeline_run_id
      join projects p on p.id = pr.project_id
      where tr.id = task_run_id and has_org_role(p.org_id, 'developer')
    )
  );

-- ===================== APPROVAL VOTES =====================
alter table approval_votes enable row level security;

create policy "org_members_can_read_votes"
  on approval_votes for select
  using (
    exists (
      select 1 from deployment_approvals da
      join task_runs tr on tr.id = da.task_run_id
      join pipeline_runs pr on pr.id = tr.pipeline_run_id
      join projects p on p.id = pr.project_id
      where da.id = approval_id and is_org_member(p.org_id)
    )
  );

-- Users can only insert their own vote
create policy "users_can_vote"
  on approval_votes for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from deployment_approvals da
      join task_runs tr on tr.id = da.task_run_id
      join pipeline_runs pr on pr.id = tr.pipeline_run_id
      join projects p on p.id = pr.project_id
      where da.id = approval_id and has_org_role(p.org_id, 'developer')
    )
  );
-- ============================================================
-- Migration 009: Realtime publications
-- Enable Supabase Realtime on tables that need live updates
-- in the dashboard (DAG status, logs, deployments, health).
-- ============================================================

-- Enable realtime for key tables
-- Supabase Realtime uses postgres_changes to broadcast row changes.
-- Clients subscribe with supabase.channel().on('postgres_changes', ...).

alter publication supabase_realtime add table pipeline_runs;
alter publication supabase_realtime add table task_runs;
alter publication supabase_realtime add table step_runs;
alter publication supabase_realtime add table run_logs;
alter publication supabase_realtime add table deployments;
alter publication supabase_realtime add table health_check_results;
alter publication supabase_realtime add table deployment_approvals;
alter publication supabase_realtime add table approval_votes;
alter publication supabase_realtime add table runner_registrations;
