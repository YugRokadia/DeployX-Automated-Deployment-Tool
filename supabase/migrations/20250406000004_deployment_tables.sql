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
