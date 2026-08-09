-- ============================================================
-- Migration 020: Add RLS to healing_events table
--
-- healing_events was missing RLS — any authenticated user
-- could read/write any org's healing events.
-- Scopes access via deployments → projects → org_id.
-- ============================================================

alter table healing_events enable row level security;

-- SELECT: org members can read healing events for their deployments
create policy "org_members_can_read_healing_events"
  on healing_events for select
  using (
    exists (
      select 1 from deployments d
      join projects p on d.project_id = p.id
      where d.id = healing_events.deployment_id
        and is_org_member(p.org_id)
    )
  );

-- INSERT: org members can insert (runner reports healing via API)
create policy "org_members_can_insert_healing_events"
  on healing_events for insert
  with check (
    exists (
      select 1 from deployments d
      join projects p on d.project_id = p.id
      where d.id = healing_events.deployment_id
        and is_org_member(p.org_id)
    )
  );
