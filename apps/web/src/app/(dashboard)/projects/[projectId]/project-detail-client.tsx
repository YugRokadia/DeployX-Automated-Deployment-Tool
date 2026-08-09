"use client";

import Link from "next/link";
import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";

import { TopBar } from "@/components/layout/top-bar";
import { RunHistoryChart } from "@/components/dashboard/run-history-chart";
import { SlaUptimeRing } from "@/components/observability/sla-uptime-ring";
import { FailureRiskBadge } from "@/components/observability/failure-risk-badge";
import { PredictionStat } from "@/components/observability/prediction-stat";
import type { SlaStatus, FailureRiskResult } from "@deployx/shared";
import { triggerPipelineRun } from "./pipelines/actions";
import { createSecret, deleteSecret } from "./secrets/actions";
import {
  createWebhookConfig,
  deleteWebhookConfig,
  toggleWebhookConfig,
  regenerateWebhookSecret,
  updateWebhookConfig,
} from "./webhooks/actions";
import { SchedulesSection } from "@/components/projects/schedules-section";
import { formatDate, formatDateShort } from "@/lib/format-date";

type Tab = "pipelines" | "deployments" | "sla" | "settings";

interface SlaData {
  readonly uptimePercent: number;
  readonly slaStatus: SlaStatus;
  readonly healthChecks: ReadonlyArray<{
    readonly status: string;
    readonly checked_at: string;
  }>;
}

interface ProjectData {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly git_repo_url: string;
  readonly default_branch: string;
  readonly deploy_target: string;
  readonly created_at: string;
}

interface PipelineRunData {
  readonly id: string;
  readonly status: string;
  readonly trigger_type: string;
  readonly git_branch: string | null;
  readonly git_sha: string | null;
  readonly duration_ms: number | null;
  readonly created_at: string;
  readonly pipeline_definition_id: string;
}

interface PipelineDefinitionData {
  readonly id: string;
  readonly name: string;
  readonly current_version_id: string | null;
}

interface DeploymentData {
  readonly id: string;
  readonly status: string;
  readonly strategy: string;
  readonly deploy_target: string;
  readonly health_status: string;
  readonly created_at: string;
}

interface ProjectMetrics {
  readonly successRate: number | null;
  readonly avgDurationMs: number | null;
  readonly p95DurationMs: number | null;
  readonly activeRunners: number;
}

interface SecretData {
  readonly id: string;
  readonly key: string;
  readonly is_secret: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

interface WebhookConfigData {
  readonly id: string;
  readonly pipeline_definition_id: string | null;
  readonly branch_filter: string | null;
  readonly is_active: boolean;
  readonly last_triggered_at: string | null;
  readonly created_at: string;
}

interface WebhookDeliveryData {
  readonly id: string;
  readonly event_type: string;
  readonly payload_ref: string | null;
  readonly status: string;
  readonly status_message: string | null;
  readonly pipeline_run_id: string | null;
  readonly created_at: string;
}

interface ScheduleData {
  readonly id: string;
  readonly pipeline_definition_id: string;
  readonly cron_expression: string;
  readonly timezone: string;
  readonly git_branch: string | null;
  readonly is_active: boolean;
  readonly next_run_at: string | null;
  readonly last_run_at: string | null;
  readonly created_at: string;
}

interface ProjectDetailClientProps {
  readonly project: ProjectData;
  readonly pipelineDefinitions: readonly PipelineDefinitionData[];
  readonly pipelineRuns: readonly PipelineRunData[];
  readonly deployments: readonly DeploymentData[];
  readonly metrics: ProjectMetrics;
  readonly secrets: readonly SecretData[];
  readonly webhookConfig: WebhookConfigData | null;
  readonly webhookDeliveries: readonly WebhookDeliveryData[];
  readonly schedules: readonly ScheduleData[];
  readonly slaData?: SlaData;
  readonly predictedDuration?: number | null;
  readonly failureRisk?: FailureRiskResult;
}

const RUN_STATUS_BADGE: Record<string, { text: string; className: string }> = {
  success: { text: "Success", className: "bg-tertiary/10 text-tertiary" },
  failed: { text: "Failed", className: "bg-error/10 text-error" },
  running: { text: "Running", className: "bg-primary/10 text-primary" },
  queued: { text: "Queued", className: "bg-on-surface-variant/10 text-on-surface-variant" },
  created: { text: "Created", className: "bg-on-surface-variant/10 text-on-surface-variant" },
  cancelled: { text: "Cancelled", className: "bg-on-surface-variant/10 text-on-surface-variant" },
  timed_out: { text: "Timed Out", className: "bg-error/10 text-error" },
};

export function ProjectDetailClient({
  project,
  pipelineDefinitions,
  pipelineRuns,
  deployments,
  metrics,
  secrets,
  webhookConfig,
  webhookDeliveries,
  schedules,
  slaData,
  predictedDuration,
  failureRisk,
}: ProjectDetailClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>("pipelines");
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [showTriggerMenu, setShowTriggerMenu] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleTrigger = (definitionId: string) => {
    setTriggerError(null);
    setShowTriggerMenu(false);
    startTransition(async () => {
      const result = await triggerPipelineRun(project.id, definitionId);
      if (result.error) {
        setTriggerError(result.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleTriggerClick = () => {
    if (pipelineDefinitions.length === 0) {
      router.push(`/projects/${project.id}/pipelines/new`);
      return;
    }
    const withVersion = pipelineDefinitions.filter((d) => d.current_version_id);
    if (withVersion.length === 1) {
      handleTrigger(withVersion[0].id);
      return;
    }
    setShowTriggerMenu((prev) => !prev);
  };

  return (
    <>
      <TopBar
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name },
        ]}
      />
      <div className="p-8 pb-0 max-w-[1600px] mx-auto">
        {triggerError && (
          <div className="mb-4 bg-error/10 border border-error/30 rounded-md p-3 text-xs text-error">
            {triggerError}
          </div>
        )}

        {/* Project Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
                {project.name}
              </h1>
              {project.git_repo_url && (
                <a
                  href={project.git_repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-outline hover:text-primary transition-colors flex items-center gap-1 text-sm"
                >
                  <span className="material-symbols-outlined text-lg">link</span>
                  <span className="font-mono">
                    {project.git_repo_url.replace(/^https?:\/\//, "")}
                  </span>
                </a>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-on-surface-variant">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">account_tree</span>
                {project.default_branch}
              </span>
              <span className="text-outline-variant">|</span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">deployed_code</span>
                {project.deploy_target.replace("_", " ")}
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <button
                onClick={handleTriggerClick}
                disabled={isPending}
                className="bg-primary hover:bg-primary/90 text-on-primary px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-primary/10 disabled:opacity-50"
              >
                {isPending ? (
                  <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-lg">bolt</span>
                )}
                {isPending ? "Triggering..." : pipelineDefinitions.length === 0 ? "Create Pipeline" : "Trigger Pipeline"}
              </button>
              {showTriggerMenu && pipelineDefinitions.filter((d) => d.current_version_id).length > 1 && (
                <div className="absolute right-0 mt-2 w-64 bg-surface-container rounded-lg shadow-2xl border border-outline-variant/10 z-20 py-1">
                  {pipelineDefinitions
                    .filter((d) => d.current_version_id)
                    .map((d) => (
                      <button
                        key={d.id}
                        onClick={() => handleTrigger(d.id)}
                        className="w-full text-left px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-highest transition-colors"
                      >
                        {d.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
            <button className="border border-outline-variant/30 hover:bg-surface-container-highest text-on-surface px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-all">
              <span className="material-symbols-outlined text-lg">settings</span>
              Settings
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant/10 gap-8">
          <TabButton active={activeTab === "pipelines"} icon="list_alt" label="Pipelines" onClick={() => setActiveTab("pipelines")} />
          <TabButton active={activeTab === "deployments"} icon="rocket_launch" label="Deployments" onClick={() => setActiveTab("deployments")} />
          <TabButton active={activeTab === "sla"} icon="monitoring" label="SLA" onClick={() => setActiveTab("sla")} />
          <TabButton active={activeTab === "settings"} icon="tune" label="Project Settings" onClick={() => setActiveTab("settings")} />
        </div>
      </div>

      <div className="p-8 max-w-[1600px] mx-auto">
        {activeTab === "pipelines" && (
          <PipelinesTab
            projectId={project.id}
            pipelineDefinitions={pipelineDefinitions}
            runs={pipelineRuns}
            metrics={metrics}
            predictedDuration={predictedDuration ?? null}
            failureRisk={failureRisk}
          />
        )}
        {activeTab === "deployments" && <DeploymentsTab projectId={project.id} deployments={deployments} />}
        {activeTab === "sla" && slaData && (
          <SlaTab slaData={slaData} />
        )}
        {activeTab === "settings" && (
          <SettingsTab
            projectId={project.id}
            secrets={secrets}
            webhookConfig={webhookConfig}
            webhookDeliveries={webhookDeliveries}
            pipelineDefinitions={pipelineDefinitions}
            schedules={schedules}
          />
        )}
      </div>
    </>
  );
}

function TabButton({ active, icon, label, onClick }: {
  readonly active: boolean;
  readonly icon: string;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`pb-4 text-sm font-medium flex items-center gap-2 transition-all ${
        active ? "text-primary border-b-2 border-primary font-semibold" : "text-on-surface-variant hover:text-on-surface"
      }`}
    >
      <span className="material-symbols-outlined text-lg">{icon}</span>
      {label}
    </button>
  );
}

function SlaTab({ slaData }: { readonly slaData: SlaData }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="border border-outline-variant/10 rounded-lg p-6 flex justify-center">
          <SlaUptimeRing
            uptimePercent={slaData.uptimePercent}
            slaStatus={slaData.slaStatus}
          />
        </div>
        <div className="md:col-span-2 border border-outline-variant/10 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-on-surface mb-3">
            Uptime (Last 24 Hours)
          </h3>
          <p className="text-xs text-on-surface-variant/50 mb-4">
            Target: 99.9% &middot; Current: {slaData.uptimePercent.toFixed(2)}%
          </p>
          {slaData.healthChecks.length === 0 ? (
            <div className="text-center py-8 text-on-surface-variant/40 text-sm">
              No health check data available
            </div>
          ) : (
            <div className="text-xs text-on-surface-variant/50">
              {slaData.healthChecks.length} health checks in the last 24 hours
            </div>
          )}
        </div>
      </div>

      {slaData.healthChecks.length > 0 && (
        <div className="border border-outline-variant/10 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-on-surface mb-3">
            Recent Health Checks
          </h3>
          <div className="space-y-1">
            {slaData.healthChecks.slice(0, 20).map((check, i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-1.5 text-xs"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    check.status === "pass" ? "bg-tertiary" : "bg-error"
                  }`}
                />
                <span className="text-on-surface-variant/60">
                  {formatDate(check.checked_at)}
                </span>
                <span
                  className={
                    check.status === "pass" ? "text-tertiary" : "text-error"
                  }
                >
                  {check.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PipelinesTab({ projectId, pipelineDefinitions, runs, metrics, predictedDuration, failureRisk }: {
  readonly projectId: string;
  readonly pipelineDefinitions: readonly PipelineDefinitionData[];
  readonly runs: readonly PipelineRunData[];
  readonly metrics: ProjectMetrics;
  readonly predictedDuration: number | null;
  readonly failureRisk?: FailureRiskResult;
}) {
  const showPipelineColumn = pipelineDefinitions.length > 1;
  const nameMap = new Map(pipelineDefinitions.map((d) => [d.id, d.name]));

  const definitionsSection = (
    <div className="bg-surface-container-low rounded-xl ring-1 ring-outline-variant/10 overflow-hidden mb-6">
      <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
        <div>
          <h3 className="text-sm font-bold text-on-surface">Pipeline Definitions</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {pipelineDefinitions.length} definition{pipelineDefinitions.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${projectId}/pipelines`}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-sm">settings</span>
            Manage
          </Link>
          <Link
            href={`/projects/${projectId}/pipelines/new`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New Pipeline
          </Link>
        </div>
      </div>
      {pipelineDefinitions.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-on-surface-variant">No pipelines defined</p>
          <p className="text-xs text-on-surface-variant/60 mt-1">
            Create a pipeline definition to start automating builds
          </p>
        </div>
      ) : (
        <div className="divide-y divide-outline-variant/5">
          {pipelineDefinitions.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-6 py-3 hover:bg-surface-container transition-colors">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-sm text-on-surface-variant">
                  account_tree
                </span>
                <span className="text-sm font-bold text-on-surface">{d.name}</span>
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                  d.current_version_id
                    ? "bg-tertiary/10 text-tertiary"
                    : "bg-on-surface-variant/10 text-on-surface-variant"
                }`}>
                  {d.current_version_id ? "Active" : "Draft"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (runs.length === 0) {
    return (
      <>
        {definitionsSection}
        <div className="bg-surface-container-low rounded-xl overflow-hidden ring-1 ring-outline-variant/10">
          <div className="px-6 py-12 text-center">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">rocket_launch</span>
            <p className="text-sm text-on-surface-variant">No pipeline runs yet</p>
            <p className="text-xs text-on-surface-variant/60 mt-1">Trigger a pipeline or push to your repository to start</p>
          </div>
        </div>
        <BentoStats metrics={metrics} />
      </>
    );
  }

  return (
    <>
      {definitionsSection}
      <div className="bg-surface-container-low rounded-xl overflow-hidden ring-1 ring-outline-variant/10">
        <table className="w-full">
          <thead>
            <tr className="text-xs font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
              <th className="text-left px-6 py-3">Status</th>
              {showPipelineColumn && <th className="text-left px-6 py-3">Pipeline</th>}
              <th className="text-left px-6 py-3">Branch</th>
              <th className="text-left px-6 py-3">Commit</th>
              <th className="text-left px-6 py-3">Trigger</th>
              <th className="text-left px-6 py-3">Duration</th>
              <th className="text-left px-6 py-3">Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const badge = RUN_STATUS_BADGE[run.status] ?? RUN_STATUS_BADGE.created;
              return (
                <tr key={run.id} className="border-b border-outline-variant/5 hover:bg-surface-container transition-colors">
                  <td className="px-6 py-3">
                    <Link href={`/projects/${projectId}/runs/${run.id}`}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase ${badge.className}`}>
                        {badge.text}
                      </span>
                    </Link>
                  </td>
                  {showPipelineColumn && (
                    <td className="px-6 py-3 text-xs font-semibold text-on-surface-variant">
                      {nameMap.get(run.pipeline_definition_id) ?? "—"}
                    </td>
                  )}
                  <td className="px-6 py-3 text-sm font-mono">{run.git_branch ?? "—"}</td>
                  <td className="px-6 py-3 text-sm font-mono text-on-surface-variant">{run.git_sha?.slice(0, 7) ?? "—"}</td>
                  <td className="px-6 py-3 text-xs text-on-surface-variant">{run.trigger_type}</td>
                  <td className="px-6 py-3 text-xs font-mono">{run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : "—"}</td>
                  <td className="px-6 py-3 text-xs text-on-surface-variant">{formatDate(run.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <BentoStats metrics={metrics} />
      {(predictedDuration !== undefined || failureRisk) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {predictedDuration !== undefined && (
            <PredictionStat
              predictedMs={predictedDuration}
              actualAvgMs={metrics.avgDurationMs}
            />
          )}
          {failureRisk && (
            <div className="border border-outline-variant/10 rounded-lg p-4">
              <p className="text-xs text-on-surface-variant/50 mb-2">
                Failure Risk
              </p>
              <FailureRiskBadge level={failureRisk.level} risk={failureRisk.risk} />
            </div>
          )}
        </div>
      )}
      <RunHistoryChart runs={runs} />
    </>
  );
}

function formatMetricDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function BentoStats({ metrics }: { readonly metrics: ProjectMetrics }) {
  const rateDisplay = metrics.successRate !== null ? `${metrics.successRate}%` : "—";
  const rateWidth = metrics.successRate !== null ? `${metrics.successRate}%` : "0%";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
      <div className="p-6 bg-surface-container-low rounded-xl ring-1 ring-outline-variant/10">
        <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-4">Success Rate</p>
        <span className="text-4xl font-extrabold text-on-surface leading-none">{rateDisplay}</span>
        <div className="mt-4 h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
          <div
            className="h-full bg-tertiary-container transition-all duration-500"
            style={{ width: rateWidth }}
          />
        </div>
      </div>
      <div className="p-6 bg-surface-container-low rounded-xl ring-1 ring-outline-variant/10">
        <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-4">Avg Duration</p>
        <span className="text-4xl font-extrabold text-on-surface leading-none">
          {formatMetricDuration(metrics.avgDurationMs)}
        </span>
        <p className="text-xs text-on-surface-variant mt-4 font-mono opacity-60">
          P95: {formatMetricDuration(metrics.p95DurationMs)}
        </p>
      </div>
      <div className="p-6 bg-surface-container-low rounded-xl ring-1 ring-outline-variant/10 flex flex-col justify-between">
        <div>
          <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-2">Active Runners</p>
          <p className="text-2xl font-extrabold text-on-surface">{metrics.activeRunners}</p>
        </div>
        <Link href="/runners" className="w-full mt-4 text-xs font-bold text-primary flex items-center justify-center gap-1 hover:underline">
          Manage Runners
          <span className="material-symbols-outlined text-sm">east</span>
        </Link>
      </div>
    </div>
  );
}

function DeploymentsTab({ projectId, deployments }: { readonly projectId: string; readonly deployments: readonly DeploymentData[] }) {
  if (deployments.length === 0) {
    return (
      <div className="bg-surface-container-low rounded-xl p-12 text-center ring-1 ring-outline-variant/10">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">cloud_upload</span>
        <p className="text-sm text-on-surface-variant">No deployments yet</p>
        <p className="text-xs text-on-surface-variant/60 mt-1">Deployments will appear here after a pipeline completes</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {deployments.map((d) => (
        <Link key={d.id} href={`/projects/${projectId}/deployments/${d.id}`} className="block bg-surface-container-low rounded-xl p-6 ring-1 ring-outline-variant/10 hover:bg-surface-container transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className={`w-2 h-2 rounded-full ${d.status === "active" ? "bg-tertiary" : d.status === "failed" ? "bg-error" : "bg-on-surface-variant/40"}`} />
              <span className="text-sm font-semibold text-on-surface capitalize">{d.status}</span>
              <span className="text-xs text-on-surface-variant capitalize">{d.strategy.replace("_", " ")}</span>
            </div>
            <span className="text-xs text-on-surface-variant">{formatDate(d.created_at)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function SettingsTab({
  projectId,
  secrets,
  webhookConfig,
  webhookDeliveries,
  pipelineDefinitions,
  schedules,
}: {
  readonly projectId: string;
  readonly secrets: readonly SecretData[];
  readonly webhookConfig: WebhookConfigData | null;
  readonly webhookDeliveries: readonly WebhookDeliveryData[];
  readonly pipelineDefinitions: readonly PipelineDefinitionData[];
  readonly schedules: readonly ScheduleData[];
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleDelete = (secretId: string) => {
    startDeleteTransition(async () => {
      await deleteSecret(projectId, secretId);
      setDeletingId(null);
    });
  };

  return (
    <div className="space-y-6">
      {/* Environment Variables Section */}
      <div className="bg-surface-container-low rounded-xl ring-1 ring-outline-variant/10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
          <div>
            <h3 className="text-sm font-bold text-on-surface">Environment Variables</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Variables are encrypted and injected into pipeline runs via <code className="text-primary/80">{"${{ env.KEY }}"}</code>
            </p>
          </div>
          <button
            onClick={() => setShowAddForm((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">{showAddForm ? "close" : "add"}</span>
            {showAddForm ? "Cancel" : "Add Variable"}
          </button>
        </div>

        {showAddForm && (
          <AddSecretForm
            projectId={projectId}
            onSuccess={() => setShowAddForm(false)}
          />
        )}

        {secrets.length === 0 && !showAddForm ? (
          <div className="px-6 py-12 text-center">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/20 mb-3 block">key</span>
            <p className="text-sm text-on-surface-variant">No environment variables configured</p>
            <p className="text-xs text-on-surface-variant/60 mt-1">Add variables to inject into your pipeline runs</p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/5">
            {secrets.map((secret) => (
              <div
                key={secret.id}
                className="flex items-center justify-between px-6 py-3 hover:bg-surface-container transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-sm text-on-surface-variant">
                    {secret.is_secret ? "lock" : "lock_open"}
                  </span>
                  <span className="text-sm font-mono font-bold text-on-surface">{secret.key}</span>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                    secret.is_secret
                      ? "bg-error/10 text-error"
                      : "bg-on-surface-variant/10 text-on-surface-variant"
                  }`}>
                    {secret.is_secret ? "Secret" : "Variable"}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-on-surface-variant">
                    {formatDateShort(secret.updated_at)}
                  </span>
                  {deletingId === secret.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-error font-medium">Delete?</span>
                      <button
                        onClick={() => handleDelete(secret.id)}
                        disabled={isDeleting}
                        className="text-xs font-bold text-error hover:underline disabled:opacity-50"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-xs font-bold text-on-surface-variant hover:underline"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(secret.id)}
                      className="text-on-surface-variant/50 hover:text-error transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Webhooks Section */}
      <WebhooksSection
        projectId={projectId}
        config={webhookConfig}
        deliveries={webhookDeliveries}
        pipelineDefinitions={pipelineDefinitions}
      />

      {/* Schedules Section */}
      <SchedulesSection
        projectId={projectId}
        schedules={schedules}
        pipelineDefinitions={pipelineDefinitions}
      />
    </div>
  );
}

function AddSecretForm({ projectId, onSuccess }: { readonly projectId: string; readonly onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(
    createSecret.bind(null, projectId),
    {},
  );

  // Close form on success
  if (state.success) {
    onSuccess();
  }

  return (
    <form action={formAction} className="px-6 py-4 bg-surface-container/50 border-b border-outline-variant/10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
            Key
          </label>
          <input
            name="key"
            placeholder="DATABASE_URL"
            required
            className="w-full px-3 py-2 bg-surface-container-highest rounded text-sm font-mono text-on-surface placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary focus:outline-none"
          />
          {state.fieldErrors?.key && (
            <p className="text-xs text-error mt-1">{state.fieldErrors.key[0]}</p>
          )}
        </div>
        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
            Value
          </label>
          <input
            name="value"
            type="password"
            placeholder="••••••••"
            required
            className="w-full px-3 py-2 bg-surface-container-highest rounded text-sm font-mono text-on-surface placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary focus:outline-none"
          />
          {state.fieldErrors?.value && (
            <p className="text-xs text-error mt-1">{state.fieldErrors.value[0]}</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="hidden" name="is_secret" value="true" />
          <span className="text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-sm align-middle mr-1">lock</span>
            Value will be encrypted and masked
          </span>
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Add Variable"}
        </button>
      </div>
      {state.error && (
        <p className="text-xs text-error mt-2">{state.error}</p>
      )}
    </form>
  );
}

function WebhooksSection({
  projectId,
  config,
  deliveries,
  pipelineDefinitions,
}: {
  readonly projectId: string;
  readonly config: WebhookConfigData | null;
  readonly deliveries: readonly WebhookDeliveryData[];
  readonly pipelineDefinitions: readonly PipelineDefinitionData[];
}) {
  const [isCreating, startCreateTransition] = useTransition();
  const [isToggling, startToggleTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isRegenerating, startRegenerateTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();
  const [shownSecret, setShownSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/github/${projectId}`
    : `/api/webhooks/github/${projectId}`;

  const handleCreate = () => {
    setError(null);
    startCreateTransition(async () => {
      const result = await createWebhookConfig(projectId);
      if (result.error) {
        setError(result.error);
      } else if (result.webhookSecret) {
        setShownSecret(result.webhookSecret);
        router.refresh();
      }
    });
  };

  const handleToggle = (configId: string, active: boolean) => {
    startToggleTransition(async () => {
      const result = await toggleWebhookConfig(projectId, configId, active);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  const handleDelete = (configId: string) => {
    startDeleteTransition(async () => {
      const result = await deleteWebhookConfig(projectId, configId);
      if (result.error) setError(result.error);
      else {
        setConfirmDelete(false);
        router.refresh();
      }
    });
  };

  const handleRegenerate = (configId: string) => {
    startRegenerateTransition(async () => {
      const result = await regenerateWebhookSecret(projectId, configId);
      if (result.error) setError(result.error);
      else if (result.webhookSecret) {
        setShownSecret(result.webhookSecret);
        router.refresh();
      }
    });
  };

  const handleSaveConfig = (configId: string, formData: FormData) => {
    startSaveTransition(async () => {
      const result = await updateWebhookConfig(projectId, configId, {}, formData);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-surface-container-low rounded-xl ring-1 ring-outline-variant/10 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
        <div>
          <h3 className="text-sm font-bold text-on-surface">GitHub Webhooks</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Automatically trigger pipeline runs on push events
          </p>
        </div>
        {!config && (
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            {isCreating ? "Setting up..." : "Enable Webhook"}
          </button>
        )}
      </div>

      {error && (
        <div className="px-6 py-3 bg-error/10 text-xs text-error border-b border-outline-variant/10">
          {error}
        </div>
      )}

      {shownSecret && (
        <div className="px-6 py-3 bg-tertiary/10 border-b border-outline-variant/10">
          <p className="text-xs font-bold text-tertiary mb-1">Webhook Secret (copy now — shown only once)</p>
          <code className="text-xs font-mono text-on-surface break-all select-all">{shownSecret}</code>
          <button
            onClick={() => setShownSecret(null)}
            className="block text-xs text-on-surface-variant mt-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {!config ? (
        <div className="px-6 py-12 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/20 mb-3 block">webhook</span>
          <p className="text-sm text-on-surface-variant">No webhook configured</p>
          <p className="text-xs text-on-surface-variant/60 mt-1">Enable a webhook to trigger pipelines from GitHub pushes</p>
        </div>
      ) : (
        <div className="divide-y divide-outline-variant/5">
          {/* Status + Controls */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${config.is_active ? "bg-tertiary" : "bg-on-surface-variant/40"}`} />
              <span className="text-sm font-medium text-on-surface">
                {config.is_active ? "Active" : "Disabled"}
              </span>
              {config.last_triggered_at && (
                <span className="text-xs text-on-surface-variant">
                  Last triggered {formatDate(config.last_triggered_at)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleToggle(config.id, !config.is_active)}
                disabled={isToggling}
                className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
              >
                {config.is_active ? "Disable" : "Enable"}
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-error font-medium">Delete?</span>
                  <button
                    onClick={() => handleDelete(config.id)}
                    disabled={isDeleting}
                    className="text-xs font-bold text-error hover:underline disabled:opacity-50"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs font-bold text-on-surface-variant hover:underline"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-on-surface-variant/50 hover:text-error transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              )}
            </div>
          </div>

          {/* Webhook URL */}
          <div className="px-6 py-4">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Payload URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-on-surface bg-surface-container-highest px-3 py-2 rounded truncate">
                {webhookUrl}
              </code>
              <button
                onClick={handleCopyUrl}
                className="px-2 py-2 text-on-surface-variant hover:text-primary transition-colors"
                title="Copy URL"
              >
                <span className="material-symbols-outlined text-sm">
                  {copied ? "check" : "content_copy"}
                </span>
              </button>
            </div>
          </div>

          {/* Secret */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Secret</p>
              <span className="text-xs font-mono text-on-surface-variant">{"*".repeat(32)}</span>
            </div>
            <button
              onClick={() => handleRegenerate(config.id)}
              disabled={isRegenerating}
              className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
            >
              {isRegenerating ? "Regenerating..." : "Regenerate"}
            </button>
          </div>

          {/* Config: Branch Filter + Pipeline */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveConfig(config.id, new FormData(e.currentTarget));
            }}
            className="px-6 py-4 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Branch Filter
                </label>
                <input
                  name="branch_filter"
                  defaultValue={config.branch_filter ?? ""}
                  placeholder="main (leave empty for all branches)"
                  className="w-full px-3 py-2 bg-surface-container-highest rounded text-sm font-mono text-on-surface placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Pipeline
                </label>
                <select
                  name="pipeline_definition_id"
                  defaultValue={config.pipeline_definition_id ?? ""}
                  className="w-full px-3 py-2 bg-surface-container-highest rounded text-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="">Auto (first pipeline)</option>
                  {pipelineDefinitions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </form>

          {/* Delivery History */}
          {deliveries.length > 0 && (
            <div className="px-6 py-4">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Recent Deliveries</p>
              <div className="space-y-2">
                {deliveries.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span className={`material-symbols-outlined text-sm ${
                        d.status === "success" ? "text-tertiary" :
                        d.status === "rejected" ? "text-error" :
                        d.status === "error" ? "text-error" :
                        "text-on-surface-variant"
                      }`}>
                        {d.status === "success" ? "check_circle" :
                         d.status === "skipped" ? "skip_next" :
                         "cancel"}
                      </span>
                      <span className="font-mono text-on-surface">{d.event_type}</span>
                      {d.payload_ref && (
                        <span className="font-mono text-on-surface-variant">
                          {d.payload_ref.replace("refs/heads/", "")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-on-surface-variant">{d.status_message}</span>
                      <span className="text-on-surface-variant/60">
                        {formatDate(d.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
