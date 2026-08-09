"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";
import { HealthCheckChart } from "@/components/deployment/health-check-chart";
import { CanaryProgressCard } from "@/components/deployment/canary-progress-card";
import { RollingProgressCard } from "@/components/deployment/rolling-progress-card";
import { stopDeployment, submitApprovalVote } from "../actions";
import { formatDate, formatTime } from "@/lib/format-date";

// ── Types ───────────────────────────────────────────────────────

interface ProjectData {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

interface DeploymentData {
  readonly id: string;
  readonly project_id: string;
  readonly pipeline_run_id: string | null;
  readonly status: string;
  readonly strategy: string;
  readonly deploy_target: string;
  readonly current_revision_id: string | null;
  readonly health_status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface RevisionData {
  readonly id: string;
  readonly deployment_id: string;
  readonly revision_number: number;
  readonly image_tag: string;
  readonly image_digest: string | null;
  readonly status: string;
  readonly rollback_reason: string | null;
  readonly created_at: string;
}

interface HealthCheckData {
  readonly id: string;
  readonly status: string;
  readonly response_time_ms: number | null;
  readonly status_code: number | null;
  readonly error_message: string | null;
  readonly checked_at: string;
}

interface HealingEventData {
  readonly id: string;
  readonly event_type: string;
  readonly attempt_number: number | null;
  readonly container_name: string | null;
  readonly details: Record<string, unknown> | null;
  readonly created_at: string;
}

interface ApprovalData {
  readonly id: string;
  readonly status: string;
  readonly required_approvals: number;
}

interface ApprovalVoteData {
  readonly id: string;
  readonly user_id: string;
  readonly decision: string;
  readonly comment: string | null;
  readonly created_at: string;
}

interface Props {
  readonly project: ProjectData;
  readonly deployment: DeploymentData;
  readonly revisions: readonly RevisionData[];
  readonly healthChecks: readonly HealthCheckData[];
  readonly healingEvents: readonly HealingEventData[];
  readonly approval: ApprovalData | null;
  readonly approvalVotes: readonly ApprovalVoteData[];
}

// ── Status Badges ───────────────────────────────────────────────

const STATUS_BADGE: Record<string, { text: string; className: string }> = {
  pending: { text: "Pending", className: "bg-on-surface-variant/10 text-on-surface-variant" },
  deploying: { text: "Deploying", className: "bg-primary/10 text-primary" },
  active: { text: "Active", className: "bg-tertiary/10 text-tertiary" },
  draining: { text: "Draining", className: "bg-warning/10 text-warning" },
  stopped: { text: "Stopped", className: "bg-on-surface-variant/10 text-on-surface-variant" },
  rolled_back: { text: "Rolled Back", className: "bg-error/10 text-error" },
  failed: { text: "Failed", className: "bg-error/10 text-error" },
};

const HEALTH_COLOR: Record<string, string> = {
  healthy: "text-tertiary",
  degraded: "text-warning",
  unhealthy: "text-error",
  unknown: "text-on-surface-variant",
};

const HEALTH_BG: Record<string, string> = {
  healthy: "text-tertiary",
  degraded: "text-warning",
  unhealthy: "text-error",
  unknown: "text-on-surface-variant/20",
};

const HEALING_EVENT_ICON: Record<string, string> = {
  health_degraded: "warning",
  health_unhealthy: "error",
  restart_started: "refresh",
  restart_succeeded: "check_circle",
  restart_failed: "cancel",
  rollback_started: "undo",
  rollback_succeeded: "check_circle",
  rollback_failed: "cancel",
  canary_promotion: "tune",
  canary_rollback: "undo",
  rolling_instance_updated: "autorenew",
  rolling_rollback: "undo",
};

const HEALING_EVENT_COLOR: Record<string, string> = {
  health_degraded: "text-warning",
  health_unhealthy: "text-error",
  restart_started: "text-primary",
  restart_succeeded: "text-tertiary",
  restart_failed: "text-error",
  rollback_started: "text-primary",
  rollback_succeeded: "text-tertiary",
  rollback_failed: "text-error",
  canary_promotion: "text-primary",
  canary_rollback: "text-error",
  rolling_instance_updated: "text-tertiary",
  rolling_rollback: "text-error",
};

const HEALING_EVENT_LABEL: Record<string, string> = {
  health_degraded: "Health Degraded",
  health_unhealthy: "Health Unhealthy",
  restart_started: "Restart Started",
  restart_succeeded: "Restart Succeeded",
  restart_failed: "Restart Failed",
  rollback_started: "Rollback Started",
  rollback_succeeded: "Rollback Succeeded",
  rollback_failed: "Rollback Failed",
  canary_promotion: "Canary Promotion",
  canary_rollback: "Canary Rollback",
  rolling_instance_updated: "Instance Updated",
  rolling_rollback: "Rolling Rollback",
};

// ── Component ───────────────────────────────────────────────────

export function DeploymentDetailClient({
  project,
  deployment,
  revisions,
  healthChecks,
  healingEvents,
  approval,
  approvalVotes,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const badge = STATUS_BADGE[deployment.status] ?? STATUS_BADGE.pending;
  const healthColor = HEALTH_COLOR[deployment.health_status] ?? HEALTH_COLOR.unknown;

  // Compute health percentage from recent checks
  const passCount = healthChecks.filter((c) => c.status === "pass").length;
  const healthPercent = healthChecks.length > 0
    ? Math.round((passCount / healthChecks.length) * 100)
    : 0;
  const circumference = 2 * Math.PI * 58;
  const dashOffset = healthChecks.length > 0
    ? circumference - (healthPercent / 100) * circumference
    : circumference;

  const handleStop = () => {
    startTransition(async () => {
      await stopDeployment(project.id, deployment.id);
      router.refresh();
    });
  };

  const isTerminal = ["stopped", "rolled_back", "failed"].includes(deployment.status);

  return (
    <>
      <TopBar
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "Deployments" },
          { label: `#${revisions[revisions.length - 1]?.revision_number ?? 1}` },
        ]}
      />

      {/* Deployment Header */}
      <section className="px-8 py-6 bg-gradient-to-b from-surface-container to-transparent">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 max-w-[1600px] mx-auto">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold tracking-tight text-on-surface">
                Deployment
              </h1>
              <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider ${badge.className}`}>
                {badge.text}
              </span>
            </div>
            <div className="flex items-center gap-4 text-on-surface-variant text-sm">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">strategy</span>
                {deployment.strategy.replace("_", " ")}
              </span>
              <span className="text-outline-variant">|</span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">dns</span>
                {deployment.deploy_target.replace("_", " ")}
              </span>
              <span className="text-outline-variant">|</span>
              <span className="text-xs font-mono">
                {formatDate(deployment.created_at)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isTerminal && (
              <button
                onClick={handleStop}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 border border-error/30 text-error hover:bg-error/10 transition-colors font-medium text-sm rounded-md disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">stop_circle</span>
                {isPending ? "Stopping..." : "Stop"}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Approval Card */}
      {approval && (
        <div className="px-8 max-w-[1600px] mx-auto mb-6">
          <ApprovalCard
            projectId={project.id}
            approval={approval}
            votes={approvalVotes}
          />
        </div>
      )}

      {/* Content Grid */}
      <div className="px-8 pb-8 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto">
        {/* Left Column: Health */}
        <div className="lg:col-span-8 space-y-6">
          {/* Health Status Ring */}
          <div className="bg-surface-container rounded-lg p-6 flex flex-col md:flex-row gap-8 items-start">
            <div className="flex flex-col items-center gap-4 min-w-[160px]">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                Health Status
              </h3>
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                  <circle
                    className="text-surface-container-highest"
                    cx="64"
                    cy="64"
                    r="58"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="8"
                  />
                  <circle
                    className={HEALTH_BG[deployment.health_status] ?? "text-on-surface-variant/20"}
                    cx="64"
                    cy="64"
                    r="58"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.5s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-2xl font-bold ${healthColor}`}>
                    {healthChecks.length > 0 ? `${healthPercent}%` : "—"}
                  </span>
                  <span className={`text-[10px] uppercase font-bold ${healthColor}`}>
                    {deployment.health_status}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex-1 w-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  Response Time (ms)
                </h3>
              </div>
              <HealthCheckChart checks={healthChecks} />
            </div>
          </div>

          {/* Strategy-Specific Progress Cards */}
          {deployment.strategy === "canary" && (
            <CanaryProgressCard healingEvents={healingEvents} />
          )}
          {deployment.strategy === "rolling" && (
            <RollingProgressCard healingEvents={healingEvents} />
          )}

          {/* Recent Health Checks Table */}
          <div className="bg-surface-container rounded-lg overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant/10">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                Recent Health Checks
              </h3>
              <span className="text-xs text-on-surface-variant/60">
                {healthChecks.length} check{healthChecks.length !== 1 ? "s" : ""}
              </span>
            </div>
            {healthChecks.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-on-surface-variant/60 uppercase tracking-widest border-b border-outline-variant/10">
                    <th className="text-left px-6 py-2">Status</th>
                    <th className="text-left px-6 py-2">Response</th>
                    <th className="text-left px-6 py-2">Code</th>
                    <th className="text-left px-6 py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {healthChecks.map((check) => (
                    <tr key={check.id} className="border-b border-outline-variant/5 last:border-0">
                      <td className="px-6 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            check.status === "pass" ? "bg-tertiary" : "bg-error"
                          }`} />
                          <span className="text-xs font-medium capitalize">{check.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-2.5 text-xs font-mono">
                        {check.response_time_ms != null ? `${check.response_time_ms}ms` : "—"}
                      </td>
                      <td className="px-6 py-2.5 text-xs font-mono text-on-surface-variant">
                        {check.status_code ?? "—"}
                      </td>
                      <td className="px-6 py-2.5 text-xs text-on-surface-variant">
                        {formatTime(check.checked_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-6 py-8 text-center">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant/30 mb-2 block">
                  monitor_heart
                </span>
                <p className="text-xs text-on-surface-variant">
                  No health checks recorded yet
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Revision History */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface-container rounded-lg p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-6">
              Revision History
            </h3>
            {revisions.length > 0 ? (
              <div className="space-y-0">
                {revisions.map((rev) => {
                  const isCurrent = rev.id === deployment.current_revision_id;
                  const revBadge = STATUS_BADGE[rev.status] ?? STATUS_BADGE.pending;
                  return (
                    <div
                      key={rev.id}
                      className={`relative pl-6 pb-6 border-l-2 last:pb-0 ${
                        isCurrent
                          ? "border-primary"
                          : "border-outline-variant/20"
                      }`}
                    >
                      {/* Timeline dot */}
                      <div
                        className={`absolute -left-[7px] top-0 w-3 h-3 rounded-full border-2 ${
                          isCurrent
                            ? "bg-primary border-primary"
                            : "bg-surface-container border-outline-variant/40"
                        }`}
                      />

                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-on-surface">
                          #{rev.revision_number}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase ${revBadge.className}`}>
                          {revBadge.text}
                        </span>
                      </div>

                      <p className="text-xs font-mono text-on-surface-variant truncate mb-1">
                        {rev.image_tag}
                      </p>

                      <p className="text-[10px] text-on-surface-variant/60">
                        {formatDate(rev.created_at)}
                      </p>

                      {rev.rollback_reason && (
                        <p className="text-[10px] text-error mt-1">
                          {rev.rollback_reason}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <p className="text-xs text-on-surface-variant/50">
                  No revisions yet
                </p>
              </div>
            )}
          </div>

          {/* Image Info */}
          {revisions.length > 0 && (
            <div className="bg-surface-container rounded-lg p-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">
                Current Image
              </h3>
              <p className="text-xs font-mono text-on-surface break-all">
                {revisions[0].image_tag}
              </p>
              {revisions[0].image_digest && (
                <p className="text-[10px] font-mono text-on-surface-variant/60 mt-1 break-all">
                  {revisions[0].image_digest}
                </p>
              )}
            </div>
          )}

          {/* Self-Healing Events */}
          {healingEvents.length > 0 && (
            <div className="bg-surface-container rounded-lg p-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">
                Self-Healing Events
              </h3>
              <div className="space-y-3">
                {healingEvents.map((event) => (
                  <div key={event.id} className="flex items-start gap-3">
                    <span
                      className={`material-symbols-outlined text-sm mt-0.5 ${
                        HEALING_EVENT_COLOR[event.event_type] ?? "text-on-surface-variant"
                      }`}
                    >
                      {HEALING_EVENT_ICON[event.event_type] ?? "info"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-on-surface">
                        {HEALING_EVENT_LABEL[event.event_type] ?? event.event_type}
                        {event.attempt_number != null && ` #${event.attempt_number}`}
                      </p>
                      <p className="text-[10px] text-on-surface-variant/60">
                        {formatDate(event.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Approval Card ──────────────────────────────────────────────

function ApprovalCard({
  projectId,
  approval,
  votes,
}: {
  readonly projectId: string;
  readonly approval: ApprovalData;
  readonly votes: readonly ApprovalVoteData[];
}) {
  const [voteError, setVoteError] = useState<string | null>(null);
  const [isVoting, startVoteTransition] = useTransition();
  const router = useRouter();

  const approveCount = votes.filter((v) => v.decision === "approve").length;
  const isPending = approval.status === "pending";

  const statusBadge = {
    pending: { text: "Awaiting Approval", className: "bg-primary/10 text-primary" },
    approved: { text: "Approved", className: "bg-tertiary/10 text-tertiary" },
    rejected: { text: "Rejected", className: "bg-error/10 text-error" },
  }[approval.status] ?? { text: approval.status, className: "bg-on-surface-variant/10 text-on-surface-variant" };

  const handleVote = (decision: "approve" | "reject") => {
    setVoteError(null);
    startVoteTransition(async () => {
      const result = await submitApprovalVote(projectId, approval.id, decision);
      if (result.error) {
        setVoteError(result.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="bg-surface-container rounded-lg p-6 ring-1 ring-primary/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">approval</span>
          <h3 className="text-sm font-bold text-on-surface">Deployment Approval</h3>
          <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase ${statusBadge.className}`}>
            {statusBadge.text}
          </span>
        </div>
        <span className="text-xs text-on-surface-variant">
          {approveCount}/{approval.required_approvals} approval{approval.required_approvals !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Votes list */}
      {votes.length > 0 && (
        <div className="space-y-2 mb-4">
          {votes.map((vote) => (
            <div key={vote.id} className="flex items-center gap-3 text-xs">
              <span className={`material-symbols-outlined text-sm ${
                vote.decision === "approve" ? "text-tertiary" : "text-error"
              }`}>
                {vote.decision === "approve" ? "check_circle" : "cancel"}
              </span>
              <span className="text-on-surface font-medium capitalize">{vote.decision}d</span>
              {vote.comment && (
                <span className="text-on-surface-variant">— {vote.comment}</span>
              )}
              <span className="text-on-surface-variant/50 ml-auto">
                {formatDate(vote.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      {voteError && (
        <p className="text-xs text-error mb-3">{voteError}</p>
      )}

      {/* Vote buttons */}
      {isPending && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleVote("approve")}
            disabled={isVoting}
            className="flex items-center gap-1.5 px-4 py-2 bg-tertiary text-on-tertiary text-xs font-bold rounded hover:bg-tertiary/90 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">check</span>
            Approve
          </button>
          <button
            onClick={() => handleVote("reject")}
            disabled={isVoting}
            className="flex items-center gap-1.5 px-4 py-2 border border-error/30 text-error text-xs font-bold rounded hover:bg-error/10 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">close</span>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
