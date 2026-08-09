import Link from "next/link";
import { TopBar } from "@/components/layout/top-bar";
import { StatCard } from "@/components/dashboard/stat-card";
import { PipelineRunsTable } from "@/components/dashboard/pipeline-runs-table";
import { DeploymentHealthCards } from "@/components/dashboard/deployment-health-cards";
import { requireUserWithOrg } from "@/lib/auth/session";
import { formatDate } from "@/lib/format-date";

export default async function DashboardOverview() {
  const { supabase, user, org } = await requireUserWithOrg();

  const displayName =
    user.user_metadata?.full_name ??
    user.user_metadata?.user_name ??
    "there";

  // Get project IDs for this org
  const { data: orgProjects } = await supabase
    .from("projects")
    .select("id")
    .eq("org_id", org.id);

  const projectIds = (orgProjects ?? []).map((p) => p.id);

  // Fetch counts for stats (only if projects exist)
  const { count: totalRuns } = projectIds.length > 0
    ? await supabase
        .from("pipeline_runs")
        .select("id", { count: "exact", head: true })
        .in("project_id", projectIds)
    : { count: 0 };

  const { count: activeDeployments } = projectIds.length > 0
    ? await supabase
        .from("deployments")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .in("project_id", projectIds)
    : { count: 0 };

  // Fetch recent pipeline runs
  const { data: recentRuns } = projectIds.length > 0
    ? await supabase
        .from("pipeline_runs")
        .select("id, status, trigger_type, git_branch, git_sha, duration_ms, created_at, project_id, projects(name)")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(8)
    : { data: [] };

  // Fetch active deployments with health
  const { data: activeDeploymentsList } = projectIds.length > 0
    ? await supabase
        .from("deployments")
        .select("id, status, health_status, strategy, created_at, project_id, projects(name)")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(4)
    : { data: [] };

  // Compute success rate and avg build time from recent runs
  const { data: metricsRuns } = projectIds.length > 0
    ? await supabase
        .from("pipeline_runs")
        .select("status, duration_ms")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] };

  const allMetricsRuns = metricsRuns ?? [];
  const completedRuns = allMetricsRuns.filter(
    (r) => r.status === "success" || r.status === "failed",
  );
  const successfulRuns = allMetricsRuns.filter((r) => r.status === "success");
  const successRate =
    completedRuns.length > 0
      ? `${Math.round((successfulRuns.length / completedRuns.length) * 100)}%`
      : "—";

  const successDurations = successfulRuns
    .filter((r) => r.duration_ms != null)
    .map((r) => r.duration_ms as number);
  const avgBuildTime =
    successDurations.length > 0
      ? `${(successDurations.reduce((a, b) => a + b, 0) / successDurations.length / 1000).toFixed(1)}s`
      : "—";

  // Determine greeting based on time
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <TopBar breadcrumbs={[{ label: "Overview" }]} />
      <div className="px-8 pb-12 pt-4 max-w-[1600px] mx-auto">
        {/* Welcome Header */}
        <section className="mb-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold tracking-tight">
                {greeting}, {displayName}
              </h2>
              <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest rounded-sm border border-primary/20">
                {org.name}
              </span>
            </div>
            <p className="text-on-surface-variant text-sm">
              System health is{" "}
              <span className="text-tertiary">optimal</span>.{" "}
              {activeDeployments ?? 0} deployment{activeDeployments !== 1 ? "s" : ""} running.
            </p>
          </div>
          <Link
            href="/projects"
            className="bg-primary text-on-primary px-4 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-2 shadow-lg shadow-primary/10 active:scale-95"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New Pipeline
          </Link>
        </section>

        {/* Stats Row */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <StatCard
            label="Total Pipelines"
            value={String(totalRuns ?? 0)}
            icon="rocket_launch"
            accentColor="primary"
          />
          <StatCard
            label="Success Rate"
            value={successRate}
            icon="check_circle"
            accentColor="tertiary"
          />
          <StatCard
            label="Avg Build Time"
            value={avgBuildTime}
            icon="timer"
            accentColor="secondary"
          />
          <StatCard
            label="Active Deployments"
            value={String(activeDeployments ?? 0)}
            icon="dynamic_form"
            accentColor="primary-container"
          />
        </section>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-3/5">
            <PipelineRunsTable
              runs={(recentRuns ?? []).map((run) => ({
                id: run.id,
                name: `Run`,
                project: (run.projects as unknown as { name: string } | null)?.name ?? "—",
                project_id: run.project_id,
                branch: run.git_branch ?? "main",
                status: run.status as "success" | "failed" | "running" | "queued" | "created" | "cancelled" | "timed_out",
                duration: run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : null,
                triggered_at: formatDate(run.created_at),
              }))}
            />
          </div>
          <div className="lg:w-2/5">
            <DeploymentHealthCards
              deployments={(activeDeploymentsList ?? []).map((d) => ({
                id: d.id,
                name: (d.projects as unknown as { name: string } | null)?.name ?? "—",
                project_id: d.project_id,
                status: d.status as "active" | "deploying" | "rolled_back" | "stopped",
                health: d.health_status as "healthy" | "degraded" | "unhealthy" | "unknown",
                image_sha: "—",
                uptime: "—",
              }))}
            />
          </div>
        </div>
      </div>
    </>
  );
}
