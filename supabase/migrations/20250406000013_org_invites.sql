-- ============================================================
-- Migration 013: Organization invites
-- Allows admins/owners to invite users by email.
-- Invited users see pending invites when they log in.
-- ============================================================

create table org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  email       text not null,
  role        org_role not null default 'viewer',
  invited_by  uuid not null references auth.users (id),
  accepted_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (org_id, email)
);

create index idx_org_invites_org on org_invites (org_id);
create index idx_org_invites_email on org_invites (email);

-- RLS
alter table org_invites enable row level security;

-- Org members can see invites for their org
create policy "org_members_can_read_invites"
  on org_invites for select
  using (is_org_member(org_id));

-- Admins can create invites
create policy "admins_can_create_invites"
  on org_invites for insert
  with check (has_org_role(org_id, 'admin'));

-- Admins can update invites (cancel/accept)
create policy "admins_can_update_invites"
  on org_invites for update
  using (has_org_role(org_id, 'admin'));

-- Admins can delete invites
create policy "admins_can_delete_invites"
  on org_invites for delete
  using (has_org_role(org_id, 'admin'));

-- Invited users can read their own invites (by email match)
-- This allows users to see invites addressed to them even before joining
create policy "invited_users_can_read_own_invites"
  on org_invites for select
  using (email = (select auth.jwt() ->> 'email'));

-- Invited users can accept their own invites
create policy "invited_users_can_accept_own_invites"
  on org_invites for update
  using (email = (select auth.jwt() ->> 'email'));

-- Auto-update updated_at
create trigger trg_org_invites_updated_at before update on org_invites
  for each row execute function set_updated_at();
