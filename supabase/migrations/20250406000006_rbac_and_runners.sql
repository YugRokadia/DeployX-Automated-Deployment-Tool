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
