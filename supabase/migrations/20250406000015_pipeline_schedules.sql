-- ============================================================
-- Migration 015: Pipeline schedules
-- Enables cron-based scheduled pipeline triggering.
-- One schedule per project+pipeline pair (v1).
-- ============================================================

-- ===================== PIPELINE SCHEDULES =====================
create table pipeline_schedules (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references projects(id) on delete cascade,
  pipeline_definition_id uuid not null references pipeline_definitions(id) on delete cascade,
  cron_expression        text not null,
  timezone               text not null default 'UTC',
  git_branch             text,
  is_active              boolean not null default true,
  next_run_at            timestamptz,
  last_run_at            timestamptz,
  last_run_id            uuid references pipeline_runs(id) on delete set null,
  created_by             uuid not null references auth.users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  unique(project_id, pipeline_definition_id)
);

create index idx_pipeline_schedules_project on pipeline_schedules(project_id);
create index idx_pipeline_schedules_next_run on pipeline_schedules(next_run_at)
  where is_active = true;

-- ===================== RLS =====================
alter table pipeline_schedules enable row level security;

-- Org members can read schedules via project -> org relationship
create policy "org_members_can_read_pipeline_schedules"
  on pipeline_schedules for select
  using (
    exists (
      select 1 from projects p
      where p.id = pipeline_schedules.project_id
        and is_org_member(p.org_id)
    )
  );

-- Developers+ can create schedules
create policy "developers_can_create_pipeline_schedules"
  on pipeline_schedules for insert
  with check (
    exists (
      select 1 from projects p
      where p.id = pipeline_schedules.project_id
        and has_org_role(p.org_id, 'developer')
    )
  );

-- Developers+ can update schedules
create policy "developers_can_update_pipeline_schedules"
  on pipeline_schedules for update
  using (
    exists (
      select 1 from projects p
      where p.id = pipeline_schedules.project_id
        and has_org_role(p.org_id, 'developer')
    )
  );

-- Developers+ can delete schedules
create policy "developers_can_delete_pipeline_schedules"
  on pipeline_schedules for delete
  using (
    exists (
      select 1 from projects p
      where p.id = pipeline_schedules.project_id
        and has_org_role(p.org_id, 'developer')
    )
  );
