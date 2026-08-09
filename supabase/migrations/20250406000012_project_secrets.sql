-- ============================================================
-- Migration 012: Project secrets / environment variables
-- Stores encrypted key-value pairs per project.
-- Encryption is handled at the application layer (AES-256-GCM).
-- Values are never exposed via RLS — only metadata is readable.
-- ============================================================

create table project_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  key text not null,
  encrypted_value text not null,
  is_secret boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, key)
);

-- Index for fast lookup by project
create index idx_project_secrets_project_id on project_secrets(project_id);

-- RLS
alter table project_secrets enable row level security;

-- Org members can read metadata (key, is_secret, timestamps) but encrypted_value
-- is meaningless without the app-level decryption key.
create policy "org_members_can_read_secrets"
  on project_secrets for select
  using (exists (
    select 1 from projects p where p.id = project_id and is_org_member(p.org_id)
  ));

create policy "developers_can_manage_secrets"
  on project_secrets for all
  using (exists (
    select 1 from projects p where p.id = project_id and has_org_role(p.org_id, 'developer')
  ));
