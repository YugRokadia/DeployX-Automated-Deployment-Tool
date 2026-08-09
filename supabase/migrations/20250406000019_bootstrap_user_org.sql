-- ============================================================
-- Migration 019: Bootstrap user org function
--
-- Atomically create a personal org and add the user as owner.
-- SECURITY DEFINER bypasses RLS — safe because it only creates
-- an org for the calling user (auth.uid()).
--
-- Fixes the chicken-and-egg RLS problem: org_memberships INSERT
-- requires has_org_role(org_id, 'admin'), but a brand-new org
-- has zero members.
-- ============================================================

create or replace function bootstrap_user_org(
  org_name text,
  org_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  new_org_id uuid;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Prevent duplicate orgs for the same user
  if exists (
    select 1 from public.org_memberships where user_id = caller_id
  ) then
    raise exception 'User already belongs to an organization';
  end if;

  insert into public.organizations (name, slug)
  values (org_name, org_slug)
  returning id into new_org_id;

  insert into public.org_memberships (org_id, user_id, role)
  values (new_org_id, caller_id, 'owner');

  return jsonb_build_object(
    'id', new_org_id,
    'name', org_name,
    'slug', org_slug
  );
end;
$$;
