import Link from "next/link";
import type { PipelineRunStatus } from "@deployx/shared";

interface PipelineRunRow {
  readonly id: string;
  readonly name: string;
  readonly project: string;
  readonly project_id: string;
  readonly branch: string;
  readonly status: PipelineRunStatus;
  readonly duration: string | null;
  readonly triggered_at: string;
}

interface PipelineRunsTableProps {
  readonly runs: readonly PipelineRunRow[];
}

const STATUS_DOT: Record<string, string> = {
  success: "bg-tertiary shadow-[0_0_8px_rgba(74,225,118,0.4)]",
  failed: "bg-error shadow-[0_0_8px_rgba(255,180,171,0.4)]",
  running: "bg-primary animate-pulse shadow-[0_0_8px_rgba(173,198,255,0.4)]",
  queued: "bg-on-surface-variant/40",
  created: "bg-on-surface-variant/20",
  cancelled: "bg-on-surface-variant/30",
  timed_out: "bg-error/60",
};

export function PipelineRunsTable({ runs }: PipelineRunsTableProps) {
  return (
    <div className="bg-surface-container-low rounded-xl overflow-hidden">
      <div className="px-6 py-5 flex items-center justify-between bg-surface-container-high/30">
        <h3 className="text-base font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">
            analytics
          </span>
          Recent Pipeline Runs
        </h3>
        <Link
          href="/projects"
          className="text-xs font-medium text-primary hover:underline"
        >
          View All
        </Link>
      </div>

      {runs.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">
            rocket_launch
          </span>
          <p className="text-sm text-on-surface-variant">
            No pipeline runs yet
          </p>
          <p className="text-xs text-on-surface-variant/60 mt-1">
            Create a project and trigger your first pipeline
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant border-b border-outline-variant/10">
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Pipeline</th>
                <th className="px-6 py-4">Project</th>
                <th className="px-6 py-4">Branch</th>
                <th className="px-6 py-4">Duration</th>
                <th className="px-6 py-4 text-right">Triggered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {runs.map((run) => (
                <tr key={run.id} className="group">
                  <td colSpan={6} className="p-0">
                    <Link
                      href={`/projects/${run.project_id}/runs/${run.id}`}
                      className="flex hover:bg-surface-container-highest/40 transition-colors"
                    >
                      <span className="px-6 py-4 w-[80px]">
                        <span
                          className={`w-2 h-2 rounded-full inline-block ${STATUS_DOT[run.status] ?? STATUS_DOT.created}`}
                        />
                      </span>
                      <span className="px-6 py-4 flex-1 font-mono text-xs font-semibold">
                        {run.name}
                      </span>
                      <span className="px-6 py-4 flex-1 text-xs">
                        {run.project}
                      </span>
                      <span className="px-6 py-4 flex-1">
                        <span className="bg-surface-container-highest px-2 py-0.5 rounded text-[10px] font-mono">
                          {run.branch}
                        </span>
                      </span>
                      <span className="px-6 py-4 flex-1 text-xs text-on-surface-variant">
                        {run.duration ?? "--"}
                      </span>
                      <span className="px-6 py-4 flex-1 text-xs text-right text-on-surface-variant">
                        {run.triggered_at}
                      </span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
