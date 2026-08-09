-- ============================================================
-- Migration 021: Tighten storage bucket RLS policies
--
-- Previous policies only checked auth.uid() is not null.
-- Now scopes read/write/delete to the user's org by matching
-- the first folder segment of the object path to org_id.
--
-- Upload path format: {org_id}/{project_id}/{run_id}/{filename}
-- Runner uses service role (bypasses RLS), so these are
-- defense-in-depth for direct client-side access.
-- ============================================================

-- Drop old overly-permissive policies
drop policy if exists "org_members_can_read_artifacts" on storage.objects;
drop policy if exists "authenticated_can_upload_artifacts" on storage.objects;
drop policy if exists "authenticated_can_delete_artifacts" on storage.objects;

-- Read: scoped to user's org
create policy "org_members_can_read_artifacts"
  on storage.objects for select
  using (
    bucket_id = 'build-artifacts'
    and auth.uid() is not null
    and exists (
      select 1 from org_memberships om
      where om.user_id = auth.uid()
        and (storage.foldername(name))[1] = om.org_id::text
    )
  );

-- Upload: scoped to user's org
create policy "org_members_can_upload_artifacts"
  on storage.objects for insert
  with check (
    bucket_id = 'build-artifacts'
    and auth.uid() is not null
    and exists (
      select 1 from org_memberships om
      where om.user_id = auth.uid()
        and (storage.foldername(name))[1] = om.org_id::text
    )
  );

-- Delete: scoped to user's org
create policy "org_members_can_delete_artifacts"
  on storage.objects for delete
  using (
    bucket_id = 'build-artifacts'
    and auth.uid() is not null
    and exists (
      select 1 from org_memberships om
      where om.user_id = auth.uid()
        and (storage.foldername(name))[1] = om.org_id::text
    )
  );
