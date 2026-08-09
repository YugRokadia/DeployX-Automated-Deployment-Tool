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
