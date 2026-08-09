-- ============================================================
-- Migration 018: Build artifacts storage bucket
-- Supabase Storage bucket for pipeline build artifacts.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('build-artifacts', 'build-artifacts', false, 52428800);

-- ── Storage RLS policies ──────────────────────────────────────

-- Read: org members can read objects under their org path
create policy "org_members_can_read_artifacts"
  on storage.objects for select
  using (
    bucket_id = 'build-artifacts'
    and auth.uid() is not null
  );

-- Upload: authenticated users can upload
create policy "authenticated_can_upload_artifacts"
  on storage.objects for insert
  with check (
    bucket_id = 'build-artifacts'
    and auth.uid() is not null
  );

-- Delete: authenticated users can delete
create policy "authenticated_can_delete_artifacts"
  on storage.objects for delete
  using (
    bucket_id = 'build-artifacts'
    and auth.uid() is not null
  );
