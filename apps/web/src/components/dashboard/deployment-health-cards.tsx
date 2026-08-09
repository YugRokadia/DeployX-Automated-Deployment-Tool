import Link from "next/link";
import type { DeploymentStatus, HealthStatus } from "@deployx/shared";

interface DeploymentHealthRow {
  readonly id: string;
  readonly name: string;
  readonly project_id: string;
  readonly status: DeploymentStatus;
  readonly health: HealthStatus;
  readonly image_sha: string;
  readonly uptime: string;
}

interface DeploymentHealthCardsProps {
  readonly deployments: readonly DeploymentHealthRow[];
}

const STATUS_BADGE: Record<string, string> = {
  active: "text-tertiary bg-tertiary/10",
  deploying: "text-primary bg-primary/10",
  rolled_back: "text-error bg-error/10",
  stopped: "text-on-surface-variant bg-surface-container-highest",
};

const HEALTH_DOT: Record<string, string> = {
  healthy: "bg-tertiary",
  degraded: "bg-tertiary-fixed",
  unhealthy: "bg-error",
  unknown: "bg-on-surface-variant/40",
};

export function DeploymentHealthCards({
  deployments,
}: DeploymentHealthCardsProps) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-bold flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-tertiary">
          monitor_heart
        </span>
        Deployment Health
      </h3>

      {deployments.length === 0 ? (
        <div className="bg-surface-container p-8 rounded-lg text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">
            monitor_heart
          </span>
          <p className="text-sm text-on-surface-variant">
            No active deployments
          </p>
          <p className="text-xs text-on-surface-variant/60 mt-1">
            Deploy a project to see health status here
          </p>
        </div>
      ) : (
        deployments.map((dep) => (
          <Link
            key={dep.id}
            href={`/projects/${dep.project_id}/deployments/${dep.id}`}
            className="bg-surface-container p-4 rounded-lg flex items-center justify-between border border-outline-variant/10 group hover:border-primary/30 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-surface-container-highest rounded flex items-center justify-center">
                <span className="material-symbols-outlined text-on-surface-variant">
                  web
                </span>
              </div>
              <div>
                <h4 className="text-sm font-bold">{dep.name}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-tighter">
                    SHA:
                  </span>
                  <span className="text-[10px] font-mono text-primary bg-primary/5 px-1 rounded">
                    {dep.image_sha}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase ${STATUS_BADGE[dep.status] ?? STATUS_BADGE.stopped}`}
                >
                  {dep.status.replace("_", " ")}
                </span>
                <span
                  className={`w-2 h-2 rounded-full ${HEALTH_DOT[dep.health] ?? HEALTH_DOT.unknown}`}
                />
              </div>
              <span className="text-[10px] text-on-surface-variant">
                Uptime: {dep.uptime}
              </span>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
