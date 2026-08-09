-- ============================================================
-- Migration 014: Webhook configuration & delivery history
-- Enables GitHub webhook integration for automatic pipeline triggering.
-- One webhook config per project (v1), with delivery audit log.
-- ============================================================

-- ===================== WEBHOOK CONFIGS =====================
create table webhook_configs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  pipeline_definition_id uuid references pipeline_definitions(id) on delete set null,
  secret_encrypted text not null,
  branch_filter text,
  events text[] not null default '{push}',
  is_active boolean not null default true,
  last_triggered_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);

create index idx_webhook_configs_project on webhook_configs(project_id);

-- ===================== WEBHOOK DELIVERIES =====================
create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_config_id uuid not null references webhook_configs(id) on delete cascade,
  event_type text not null,
  payload_ref text,
  status text not null,
  status_message text,
  pipeline_run_id uuid references pipeline_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_webhook_deliveries_config on webhook_deliveries(webhook_config_id);
create index idx_webhook_deliveries_created on webhook_deliveries(created_at desc);

-- ===================== RLS =====================
alter table webhook_configs enable row level security;
alter table webhook_deliveries enable row level security;

-- Webhook configs: org members can read via project → org relationship
create policy "org_members_can_read_webhook_configs"
  on webhook_configs for select
  using (
    exists (
      select 1 from projects p
      where p.id = webhook_configs.project_id
        and is_org_member(p.org_id)
    )
  );

-- Webhook configs: developers+ can insert
create policy "developers_can_create_webhook_configs"
  on webhook_configs for insert
  with check (
    exists (
      select 1 from projects p
      where p.id = webhook_configs.project_id
        and has_org_role(p.org_id, 'developer')
    )
  );

-- Webhook configs: developers+ can update
create policy "developers_can_update_webhook_configs"
  on webhook_configs for update
  using (
    exists (
      select 1 from projects p
      where p.id = webhook_configs.project_id
        and has_org_role(p.org_id, 'developer')
    )
  );

-- Webhook configs: developers+ can delete
create policy "developers_can_delete_webhook_configs"
  on webhook_configs for delete
  using (
    exists (
      select 1 from projects p
      where p.id = webhook_configs.project_id
        and has_org_role(p.org_id, 'developer')
    )
  );

-- Webhook deliveries: org members can read via config → project → org
create policy "org_members_can_read_webhook_deliveries"
  on webhook_deliveries for select
  using (
    exists (
      select 1 from webhook_configs wc
      join projects p on p.id = wc.project_id
      where wc.id = webhook_deliveries.webhook_config_id
        and is_org_member(p.org_id)
    )
  );

-- Webhook deliveries: insert is done via service client (webhook receiver),
-- so no user-facing insert policy is needed.
