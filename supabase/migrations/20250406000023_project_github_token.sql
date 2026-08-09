-- ============================================================
-- Migration 023: Link projects to GitHub tokens
-- Projects created via the repo picker store a reference to
-- the GitHub token used for authenticated cloning.
-- ============================================================

alter table projects
  add column github_token_id uuid references github_tokens(id) on delete set null;
