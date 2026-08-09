-- ============================================================
-- Migration 017: Phase 13 — Advanced Observability tables
-- Alert rules, notifications, audit events.
-- ============================================================

-- ── New enums ─────────────────────────────────────────────────

create type alert_severity as enum ('info', 'warning', 'critical');

create type notification_type as enum (
  'alert_fired',
  'deployment_status',
  'pipeline_status',
  'approval_requested',
  'system'
);

create type audit_action as enum (
  'create',
  'update',
  'delete',
  'trigger',
  'approve',
  'reject',
  'rollback',
  'login'
);

-- ── Alert rules ───────────────────────────────────────────────

create table alert_rules (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  project_id        uuid references projects (id) on delete cascade,
  name              text not null,
  metric            text not null check (metric in (
    'success_rate', 'avg_duration_ms', 'health_check_failure_rate', 'deployment_health'
  )),
  operator          text not null check (operator in ('gt', 'lt', 'gte', 'lte', 'eq')),
  threshold         numeric not null,
  severity          alert_severity not null default 'warning',
  is_active         boolean not null default true,
  cooldown_minutes  integer not null default 15,
  last_triggered_at timestamptz,
  created_by        uuid not null references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_alert_rules_org_project on alert_rules (org_id, project_id);

create trigger set_alert_rules_updated_at
  before update on alert_rules
  for each row execute function set_updated_at();

-- ── Notifications ─────────────────────────────────────────────

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete cascade,
  type        notification_type not null,
  title       text not null,
  body        text not null,
  metadata    jsonb,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_notifications_user_read on notifications (user_id, is_read, created_at desc);
create index idx_notifications_org on notifications (org_id, created_at desc);

-- ── Audit events ──────────────────────────────────────────────

create table audit_events (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  user_id        uuid not null references auth.users (id),
  action         audit_action not null,
  resource_type  text not null,
  resource_id    uuid not null,
  details        jsonb,
  ip_address     text,
  created_at     timestamptz not null default now()
);

create index idx_audit_events_org_ts on audit_events (org_id, created_at desc);
create index idx_audit_events_resource on audit_events (resource_type, resource_id);
create index idx_audit_events_user on audit_events (user_id, created_at desc);

-- ── RLS policies ──────────────────────────────────────────────

-- Alert rules: org members read, admins manage
alter table alert_rules enable row level security;

create policy "org_members_can_read_alert_rules"
  on alert_rules for select
  using (is_org_member(org_id));

create policy "admins_can_insert_alert_rules"
  on alert_rules for insert
  with check (has_org_role(org_id, 'admin'));

create policy "admins_can_update_alert_rules"
  on alert_rules for update
  using (has_org_role(org_id, 'admin'));

create policy "admins_can_delete_alert_rules"
  on alert_rules for delete
  using (has_org_role(org_id, 'admin'));

-- Notifications: users read own (user_id match or broadcast), update own
alter table notifications enable row level security;

create policy "users_can_read_own_notifications"
  on notifications for select
  using (
    is_org_member(org_id)
    and (user_id = auth.uid() or user_id is null)
  );

create policy "users_can_update_own_notifications"
  on notifications for update
  using (user_id = auth.uid());

create policy "system_can_insert_notifications"
  on notifications for insert
  with check (is_org_member(org_id));

-- Audit events: org members can read, insert via service role or admin
alter table audit_events enable row level security;

create policy "org_members_can_read_audit_events"
  on audit_events for select
  using (is_org_member(org_id));

create policy "members_can_insert_audit_events"
  on audit_events for insert
  with check (is_org_member(org_id));

-- ── Realtime ──────────────────────────────────────────────────

alter publication supabase_realtime add table notifications;
