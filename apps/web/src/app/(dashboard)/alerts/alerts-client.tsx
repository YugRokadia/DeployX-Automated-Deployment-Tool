"use client";

import { useState, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";
import {
  createAlertRule,
  toggleAlertRule,
  deleteAlertRule,
} from "./actions";
import { hasMinRole } from "@deployx/shared";
import { formatDate } from "@/lib/format-date";

interface AlertRuleData {
  readonly id: string;
  readonly name: string;
  readonly metric: string;
  readonly operator: string;
  readonly threshold: number;
  readonly severity: string;
  readonly is_active: boolean;
  readonly cooldown_minutes: number;
  readonly project_id: string | null;
  readonly last_triggered_at: string | null;
  readonly created_at: string;
}

interface ProjectRef {
  readonly id: string;
  readonly name: string;
}

interface AlertsClientProps {
  readonly alertRules: readonly AlertRuleData[];
  readonly projects: readonly ProjectRef[];
  readonly currentRole: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  info: "bg-primary/10 text-primary",
  warning: "bg-[#ffd54f]/10 text-[#ffd54f]",
  critical: "bg-error/10 text-error",
};

const OPERATOR_LABEL: Record<string, string> = {
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
  eq: "=",
};

export function AlertsClient({
  alertRules,
  projects,
  currentRole,
}: AlertsClientProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isAdmin = hasMinRole(currentRole, "admin");

  const [createState, createAction] = useActionState(createAlertRule, {});

  function handleToggle(ruleId: string) {
    startTransition(async () => {
      await toggleAlertRule(ruleId);
      router.refresh();
    });
  }

  function handleDelete(ruleId: string) {
    startTransition(async () => {
      await deleteAlertRule(ruleId);
      router.refresh();
    });
  }

  return (
    <>
      <TopBar breadcrumbs={[{ label: "Alerts" }]} />

      <div className="p-8 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-on-surface">Alert Rules</h2>
            <p className="text-sm text-on-surface-variant/60 mt-1">
              Configure threshold-based alerts for your pipelines and deployments
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Create Rule
            </button>
          )}
        </div>

        {showCreateForm && (
          <form
            action={createAction}
            className="border border-outline-variant/20 rounded-lg p-6 mb-6 bg-surface-container"
          >
            <h3 className="text-sm font-semibold text-on-surface mb-4">
              New Alert Rule
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-on-surface-variant/60 mb-1">
                  Name
                </label>
                <input
                  name="name"
                  required
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-md px-3 py-2 text-sm text-on-surface"
                  placeholder="High failure rate alert"
                />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant/60 mb-1">
                  Metric
                </label>
                <select
                  name="metric"
                  required
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-md px-3 py-2 text-sm text-on-surface"
                >
                  <option value="success_rate">Success Rate</option>
                  <option value="avg_duration_ms">Avg Duration (ms)</option>
                  <option value="health_check_failure_rate">Health Check Failure Rate</option>
                  <option value="deployment_health">Deployment Health</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant/60 mb-1">
                  Operator
                </label>
                <select
                  name="operator"
                  required
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-md px-3 py-2 text-sm text-on-surface"
                >
                  <option value="lt">&lt; (less than)</option>
                  <option value="lte">&lt;= (less or equal)</option>
                  <option value="gt">&gt; (greater than)</option>
                  <option value="gte">&gt;= (greater or equal)</option>
                  <option value="eq">= (equal)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant/60 mb-1">
                  Threshold
                </label>
                <input
                  name="threshold"
                  type="number"
                  step="any"
                  required
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-md px-3 py-2 text-sm text-on-surface"
                  placeholder="80"
                />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant/60 mb-1">
                  Severity
                </label>
                <select
                  name="severity"
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-md px-3 py-2 text-sm text-on-surface"
                >
                  <option value="info">Info</option>
                  <option value="warning" selected>Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant/60 mb-1">
                  Project (optional)
                </label>
                <select
                  name="project_id"
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-md px-3 py-2 text-sm text-on-surface"
                >
                  <option value="">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {createState.error && (
              <p className="text-error text-sm mt-3">{createState.error}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-on-surface-variant text-sm hover:bg-surface-container-high rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {alertRules.length === 0 ? (
          <div className="border border-outline-variant/10 rounded-lg p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">
              notifications_active
            </span>
            <p className="text-on-surface-variant/50 text-sm">
              No alert rules configured
            </p>
            <p className="text-on-surface-variant/30 text-xs mt-1">
              Create alert rules to get notified when metrics cross thresholds
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {alertRules.map((rule) => (
              <div
                key={rule.id}
                className={`border border-outline-variant/10 rounded-lg p-4 flex items-center gap-4 ${
                  !rule.is_active ? "opacity-50" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-on-surface">
                      {rule.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                        SEVERITY_BADGE[rule.severity] ?? SEVERITY_BADGE.info
                      }`}
                    >
                      {rule.severity}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant/60">
                    {rule.metric} {OPERATOR_LABEL[rule.operator] ?? rule.operator}{" "}
                    {rule.threshold}
                    {rule.last_triggered_at && (
                      <span className="ml-2 text-on-surface-variant/40">
                        Last triggered:{" "}
                        {formatDate(rule.last_triggered_at)}
                      </span>
                    )}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(rule.id)}
                      disabled={isPending}
                      className="p-1.5 hover:bg-surface-container-high rounded-md transition-colors"
                      title={rule.is_active ? "Disable" : "Enable"}
                    >
                      <span className="material-symbols-outlined text-lg text-on-surface-variant/60">
                        {rule.is_active ? "toggle_on" : "toggle_off"}
                      </span>
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      disabled={isPending}
                      className="p-1.5 hover:bg-error/10 rounded-md transition-colors"
                      title="Delete"
                    >
                      <span className="material-symbols-outlined text-lg text-error/60">
                        delete
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
