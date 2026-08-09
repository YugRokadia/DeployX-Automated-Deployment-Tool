-- ============================================================
-- Migration 022: GitHub OAuth token storage
-- Stores encrypted GitHub access tokens per user for
-- repository listing and private repo cloning.
-- Encryption is handled at the application layer (AES-256-GCM).
-- ============================================================

create table github_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  encrypted_token text not null,
  scopes          text not null default 'repo',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(user_id)
);

create index idx_github_tokens_user_id on github_tokens(user_id);

-- RLS
alter table github_tokens enable row level security;

-- Users can read their own token row (to check connection status)
create policy "users_read_own_github_token"
  on github_tokens for select
  using (user_id = auth.uid());

-- Writes happen via service client only (from auth callback).
-- No user-facing write policy needed — the service client bypasses RLS.
