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
