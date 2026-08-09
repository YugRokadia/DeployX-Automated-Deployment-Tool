import type { PipelineRunStatus } from "@deployx/shared";

interface ProjectCardProps {
  readonly id: string;
  readonly name: string;
  readonly git_repo_url: string;
  readonly last_pipeline_status: PipelineRunStatus | null;
  readonly last_deploy_time: string | null;
  readonly last_build_duration: string | null;
  readonly last_commit_sha: string | null;
}

const STATUS_BORDER: Record<string, string> = {
  success: "bg-tertiary",
  failed: "bg-error",
  running: "bg-primary",
  queued: "bg-on-surface-variant/40",
  created: "bg-on-surface-variant/20",
  cancelled: "bg-on-surface-variant/30",
  timed_out: "bg-error/60",
};

const STATUS_BADGE: Record<string, { text: string; className: string }> = {
  success: { text: "Success", className: "bg-tertiary/10 text-tertiary" },
  failed: { text: "Failed", className: "bg-error/10 text-error" },
  running: { text: "In Progress", className: "bg-primary/10 text-primary" },
  queued: {
    text: "Queued",
    className: "bg-on-surface-variant/10 text-on-surface-variant",
  },
  created: {
    text: "Created",
    className: "bg-on-surface-variant/10 text-on-surface-variant",
  },
  cancelled: {
    text: "Cancelled",
    className: "bg-on-surface-variant/10 text-on-surface-variant",
  },
  timed_out: { text: "Timed Out", className: "bg-error/10 text-error" },
};

export function ProjectCard({
  name,
  git_repo_url,
  last_pipeline_status,
  last_deploy_time,
  last_build_duration,
  last_commit_sha,
}: ProjectCardProps) {
  const status = last_pipeline_status ?? "created";
  const borderColor = STATUS_BORDER[status] ?? STATUS_BORDER.created;
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.created;

  return (
    <div className="bg-surface-container rounded-xl p-6 group hover:bg-surface-container-high transition-all duration-300 relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${borderColor}`} />

      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-on-surface group-hover:text-primary transition-colors">
            {name}
          </h3>
          <div className="flex items-center gap-2 text-on-surface-variant text-xs mt-1">
            <span className="material-symbols-outlined text-xs">
              account_tree
            </span>
            <span className="font-mono truncate max-w-[200px]">
              {git_repo_url.replace(/^https?:\/\//, "")}
            </span>
          </div>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase ${badge.className}`}
        >
          {badge.text}
        </span>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">
              Last Deploy
            </p>
            <p className="text-sm font-medium mt-1">
              {last_deploy_time ?? "Never"}
            </p>
          </div>

          {status === "running" ? (
            <div className="w-24 h-8 flex items-center justify-center">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <div className="w-2 h-2 rounded-full bg-primary/60 animate-pulse [animation-delay:200ms]" />
                <div className="w-2 h-2 rounded-full bg-primary/30 animate-pulse [animation-delay:400ms]" />
              </div>
            </div>
          ) : (
            <div className="w-24 h-8" />
          )}
        </div>

        <div className="pt-4 border-t border-outline-variant/10 flex items-center justify-between text-xs text-on-surface-variant">
          {last_build_duration ? (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">timer</span>
              {last_build_duration}
            </span>
          ) : status === "running" ? (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">sync</span>
              Deploying...
            </span>
          ) : status === "failed" ? (
            <span className="flex items-center gap-1 text-error">
              <span className="material-symbols-outlined text-xs">
                error_outline
              </span>
              Build error
            </span>
          ) : (
            <span>—</span>
          )}

          {last_commit_sha && (
            <span className="flex items-center gap-1 font-mono">
              sha: {last_commit_sha}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
