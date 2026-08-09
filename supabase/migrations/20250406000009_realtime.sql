-- ============================================================
-- Migration 009: Realtime publications
-- Enable Supabase Realtime on tables that need live updates
-- in the dashboard (DAG status, logs, deployments, health).
-- ============================================================

-- Enable realtime for key tables
-- Supabase Realtime uses postgres_changes to broadcast row changes.
-- Clients subscribe with supabase.channel().on('postgres_changes', ...).

alter publication supabase_realtime add table pipeline_runs;
alter publication supabase_realtime add table task_runs;
alter publication supabase_realtime add table step_runs;
alter publication supabase_realtime add table run_logs;
alter publication supabase_realtime add table deployments;
alter publication supabase_realtime add table health_check_results;
alter publication supabase_realtime add table deployment_approvals;
alter publication supabase_realtime add table approval_votes;
alter publication supabase_realtime add table runner_registrations;
