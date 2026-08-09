-- ============================================================
-- Migration 001: Custom enum types
-- All enums used across the DeployX schema.
-- ============================================================

create type org_role as enum ('owner', 'admin', 'developer', 'viewer');

create type pipeline_run_status as enum (
  'created', 'queued', 'running', 'success', 'failed', 'cancelled', 'timed_out'
);

create type task_run_status as enum (
  'pending', 'running', 'success', 'failed', 'cancelled', 'skipped', 'awaiting_approval'
);

create type step_run_status as enum (
  'pending', 'running', 'success', 'failed', 'cancelled', 'skipped'
);

create type deployment_status as enum (
  'pending', 'deploying', 'active', 'draining', 'stopped', 'rolled_back', 'failed'
);

create type deployment_strategy as enum ('blue_green', 'canary', 'rolling');

create type health_status as enum ('healthy', 'degraded', 'unhealthy', 'unknown');

create type runner_status as enum ('online', 'offline', 'busy');

create type log_level as enum ('debug', 'info', 'warn', 'error');

create type deploy_target as enum ('docker_local', 'railway', 'fly_io');

create type trigger_type as enum ('manual', 'webhook', 'schedule');

create type approval_status as enum ('pending', 'approved', 'rejected');

create type approval_decision as enum ('approve', 'reject');
