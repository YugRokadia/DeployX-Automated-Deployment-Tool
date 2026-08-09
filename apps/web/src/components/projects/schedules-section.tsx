"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import { CRON_PRESETS, describeCron } from "@deployx/shared";
import type { CronPresetKey } from "@deployx/shared";
import {
  createSchedule,
  deleteSchedule,
  toggleSchedule,
} from "@/app/(dashboard)/projects/[projectId]/schedules/actions";
import { formatDate } from "@/lib/format-date";

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

interface PipelineDefinitionData {
  readonly id: string;
  readonly name: string;
  readonly current_version_id: string | null;
}

interface SchedulesSectionProps {
  readonly projectId: string;
  readonly schedules: readonly ScheduleData[];
  readonly pipelineDefinitions: readonly PipelineDefinitionData[];
}

export function SchedulesSection({
  projectId,
  schedules,
  pipelineDefinitions,
}: SchedulesSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isToggling, startToggleTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleDelete = (scheduleId: string) => {
    startDeleteTransition(async () => {
      const result = await deleteSchedule(projectId, scheduleId);
      if (result.error) setError(result.error);
      else {
        setDeletingId(null);
        router.refresh();
      }
    });
  };

  const handleToggle = (scheduleId: string, active: boolean) => {
    startToggleTransition(async () => {
      const result = await toggleSchedule(projectId, scheduleId, active);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  const pipelinesWithVersion = pipelineDefinitions.filter((d) => d.current_version_id);

  return (
    <div className="bg-surface-container-low rounded-xl ring-1 ring-outline-variant/10 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
        <div>
          <h3 className="text-sm font-bold text-on-surface">Scheduled Triggers</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Automatically run pipelines on a cron schedule
          </p>
        </div>
        {pipelinesWithVersion.length > 0 && (
          <button
            onClick={() => setShowAddForm((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">{showAddForm ? "close" : "add"}</span>
            {showAddForm ? "Cancel" : "Add Schedule"}
          </button>
        )}
      </div>

      {error && (
        <div className="px-6 py-3 bg-error/10 text-xs text-error border-b border-outline-variant/10">
          {error}
        </div>
      )}

      {showAddForm && (
        <AddScheduleForm
          projectId={projectId}
          pipelineDefinitions={pipelinesWithVersion}
          onSuccess={() => setShowAddForm(false)}
        />
      )}

      {schedules.length === 0 && !showAddForm ? (
        <div className="px-6 py-12 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/20 mb-3 block">schedule</span>
          <p className="text-sm text-on-surface-variant">No scheduled triggers</p>
          <p className="text-xs text-on-surface-variant/60 mt-1">
            {pipelinesWithVersion.length === 0
              ? "Create a pipeline first to set up scheduled runs"
              : "Add a schedule to run pipelines automatically"}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-outline-variant/5">
          {schedules.map((schedule) => {
            const pipeline = pipelineDefinitions.find(
              (d) => d.id === schedule.pipeline_definition_id,
            );
            return (
              <div
                key={schedule.id}
                className="px-6 py-4 hover:bg-surface-container transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${schedule.is_active ? "bg-tertiary" : "bg-on-surface-variant/40"}`}
                    />
                    <span className="text-sm font-semibold text-on-surface">
                      {pipeline?.name ?? "Unknown Pipeline"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(schedule.id, !schedule.is_active)}
                      disabled={isToggling}
                      className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
                    >
                      {schedule.is_active ? "Disable" : "Enable"}
                    </button>
                    {deletingId === schedule.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-error font-medium">Delete?</span>
                        <button
                          onClick={() => handleDelete(schedule.id)}
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
                        onClick={() => setDeletingId(schedule.id)}
                        className="text-on-surface-variant/50 hover:text-error transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                  <span className="font-mono bg-surface-container-highest px-2 py-0.5 rounded">
                    {schedule.cron_expression}
                  </span>
                  <span>{describeCron(schedule.cron_expression)}</span>
                  {schedule.git_branch && (
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">account_tree</span>
                      {schedule.git_branch}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-[10px] text-on-surface-variant/60 mt-2">
                  {schedule.next_run_at && schedule.is_active && (
                    <span>Next: {formatDate(schedule.next_run_at)}</span>
                  )}
                  {schedule.last_run_at && (
                    <span>Last: {formatDate(schedule.last_run_at)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddScheduleForm({
  projectId,
  pipelineDefinitions,
  onSuccess,
}: {
  readonly projectId: string;
  readonly pipelineDefinitions: readonly PipelineDefinitionData[];
  readonly onSuccess: () => void;
}) {
  const [cronValue, setCronValue] = useState<string>(CRON_PRESETS.daily);
  const [state, formAction, isPending] = useActionState(
    createSchedule.bind(null, projectId),
    {},
  );

  if (state.success) {
    onSuccess();
  }

  const presetEntries = Object.entries(CRON_PRESETS) as [CronPresetKey, string][];

  return (
    <form action={formAction} className="px-6 py-4 bg-surface-container/50 border-b border-outline-variant/10">
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
            Pipeline
          </label>
          <select
            name="pipeline_definition_id"
            required
            className="w-full px-3 py-2 bg-surface-container-highest rounded text-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
          >
            {pipelineDefinitions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
            Schedule
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {presetEntries.map(([name, expr]) => (
              <button
                key={name}
                type="button"
                onClick={() => setCronValue(expr)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  cronValue === expr
                    ? "bg-primary text-on-primary font-bold"
                    : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {name.replace("-", " ")}
              </button>
            ))}
          </div>
          <input
            name="cron_expression"
            value={cronValue}
            onChange={(e) => setCronValue(e.target.value)}
            placeholder="0 0 * * *"
            required
            className="w-full px-3 py-2 bg-surface-container-highest rounded text-sm font-mono text-on-surface placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary focus:outline-none"
          />
          <p className="text-[10px] text-on-surface-variant/60 mt-1">
            {describeCron(cronValue)} — Format: minute hour day month weekday
          </p>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
            Branch Override (optional)
          </label>
          <input
            name="git_branch"
            placeholder="main (uses project default if empty)"
            className="w-full px-3 py-2 bg-surface-container-highest rounded text-sm font-mono text-on-surface placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>

        <input type="hidden" name="timezone" value="UTC" />
      </div>

      <div className="flex justify-end mt-4">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create Schedule"}
        </button>
      </div>
      {state.error && (
        <p className="text-xs text-error mt-2">{state.error}</p>
      )}
    </form>
  );
}
