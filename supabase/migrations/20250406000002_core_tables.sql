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
