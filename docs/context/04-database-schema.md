# Database Schema — Supabase PostgreSQL

## Migration Files (supabase/migrations/)
| File | Content |
|------|---------|
| `20250406000001_enums.sql` | 12 custom enum types (org_role, pipeline_run_status, etc.) |
| `20250406000002_core_tables.sql` | organizations, org_memberships, user_profiles, projects |
| `20250406000003_pipeline_tables.sql` | pipeline_definitions, pipeline_definition_versions, pipeline_runs, task_runs, step_runs |
| `20250406000004_deployment_tables.sql` | deployments, deployment_revisions, container_images |
| `20250406000005_observability_tables.sql` | run_logs, health_check_results, pipeline_metrics |
| `20250406000006_rbac_and_runners.sql` | runner_registrations, project_permissions, deployment_approvals, approval_votes |
| `20250406000007_functions_triggers.sql` | is_org_member(), has_org_role(), set_updated_at(), compute_duration_ms(), handle_new_user(), generate_slug() |
| `20250406000008_rls_policies.sql` | RLS on all 17 tables, scoped to org membership |
| `20250406000009_realtime.sql` | Realtime publications for 9 live-update tables |
| `20250406000022_github_tokens.sql` | GitHub OAuth token storage (encrypted, per-user) |
| `20250406000023_project_github_token.sql` | Links projects to GitHub tokens for private repo cloning |

## Table Count: 17
organizations, org_memberships, user_profiles, projects,
pipeline_definitions, pipeline_definition_versions, pipeline_runs, task_runs, step_runs,
deployments, deployment_revisions, container_images,
run_logs, health_check_results, pipeline_metrics,
runner_registrations, project_permissions, deployment_approvals, approval_votes

## Key Design Decisions
- **3-level execution hierarchy**: pipeline_runs -> task_runs -> step_runs (mirrors Tekton PipelineRun/TaskRun)
- **Versioned pipelines**: pipeline_definition_versions stores config_json (YAML-as-JSON), current_version_id pointer
- **Deployment revisions**: Full revision history for rollback, each with image_tag + status
- **RLS via org membership**: `is_org_member()` and `has_org_role()` helper functions used in all policies
- **Auto user_profile**: Trigger on auth.users creates profile from GitHub OAuth metadata
- **Auto duration_ms**: Trigger computes duration when finished_at is set
- **Realtime**: 9 tables published for live dashboard updates

## RBAC Hierarchy
owner > admin > developer > viewer (cumulative permissions)
- viewer: read all org data
- developer: + create projects, trigger pipelines, manage deployments
- admin: + manage members, runners, permissions, delete projects
- owner: + update org, delete org

## Realtime-Enabled Tables
pipeline_runs, task_runs, step_runs, run_logs, deployments,
health_check_results, deployment_approvals, approval_votes, runner_registrations
