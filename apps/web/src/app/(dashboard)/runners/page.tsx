import { TopBar } from "@/components/layout/top-bar";
import { requireUserWithOrg } from "@/lib/auth/session";
import { formatDate, formatDateShort } from "@/lib/format-date";
import { RegisterRunnerDialog } from "./register-runner-dialog";

const STATUS_BADGE: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  online: { label: "Online", dotClass: "bg-tertiary", badgeClass: "bg-tertiary/10 text-tertiary" },
  busy: { label: "Busy", dotClass: "bg-primary animate-pulse", badgeClass: "bg-primary/10 text-primary" },
  offline: { label: "Offline", dotClass: "bg-on-surface-variant/40", badgeClass: "bg-on-surface-variant/10 text-on-surface-variant" },
};

export default async function RunnersPage() {
  const { supabase, org } = await requireUserWithOrg();

  const { data: runners } = await supabase
    .from("runner_registrations")
    .select("id, name, status, current_job_id, last_heartbeat_at, system_info, capabilities, created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });

  const runnerList = runners ?? [];
  const total = runnerList.length;
  const online = runnerList.filter((r) => r.status === "online").length;
  const busy = runnerList.filter((r) => r.status === "busy").length;
  const offline = runnerList.filter((r) => r.status === "offline").length;

  return (
    <>
      <TopBar breadcrumbs={[{ label: "Runners" }]} />
      <div className="p-8 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-on-surface">
              Runners
            </h2>
            <p className="text-on-surface-variant text-sm mt-1">
              Manage and scale your private CI/CD execution fleet.
            </p>
          </div>
          <RegisterRunnerDialog />
        </div>

        {/* Registration Banner */}
        <section className="mb-10">
          <div className="bg-surface-container rounded-lg p-6 relative overflow-hidden group">
            <div className="absolute right-0 top-0 opacity-5 pointer-events-none">
              <span
                className="material-symbols-outlined text-[120px]"
                style={{
                  fontVariationSettings: "'wght' 100",
                }}
              >
                terminal
              </span>
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-2 py-0.5 bg-tertiary-container text-[10px] font-bold text-on-tertiary-container uppercase tracking-wider rounded-sm">
                  Setup Command
                </span>
                <span className="text-on-surface-variant text-xs font-medium">
                  To register a new runner, click &quot;Register Runner&quot; above to generate a token.
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-4 bg-surface-container-lowest border border-outline-variant/20 rounded p-4 font-mono text-sm">
                  <span className="text-tertiary select-none">$</span>
                  <span className="text-on-surface">
                    pnpm runner register --token {"<TOKEN>"} --url {"<URL>"}
                  </span>
                </div>
                <div className="flex items-center gap-4 bg-surface-container-lowest border border-outline-variant/20 rounded p-4 font-mono text-sm">
                  <span className="text-tertiary select-none">$</span>
                  <span className="text-on-surface">
                    pnpm runner start
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-on-surface-variant/50 mt-2 ml-1">
                Run from the <code className="font-mono text-primary">deployx/</code> repo root directory.
              </p>
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-6 mb-10">
          <div className="bg-surface-container p-5 rounded-lg border-l-4 border-tertiary/40">
            <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold mb-1">
              Total Fleet
            </p>
            <p className="text-2xl font-extrabold text-on-surface">{total}</p>
          </div>
          <div className="bg-surface-container p-5 rounded-lg border-l-4 border-tertiary">
            <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold mb-1">
              Online
            </p>
            <p className="text-2xl font-extrabold text-on-surface">{online}</p>
          </div>
          <div className="bg-surface-container p-5 rounded-lg border-l-4 border-primary/60">
            <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold mb-1">
              Busy Jobs
            </p>
            <p className="text-2xl font-extrabold text-on-surface">{busy}</p>
          </div>
          <div className="bg-surface-container p-5 rounded-lg border-l-4 border-error/40">
            <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold mb-1">
              Offline
            </p>
            <p className="text-2xl font-extrabold text-on-surface">{offline}</p>
          </div>
        </div>

        {/* Runners Table */}
        <div className="bg-surface-container-low rounded-xl overflow-hidden">
          {runnerList.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">
                memory
              </span>
              <p className="text-sm text-on-surface-variant">
                No runners registered
              </p>
              <p className="text-xs text-on-surface-variant/60 mt-1">
                Click &quot;Register Runner&quot; to get started
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container text-on-surface-variant uppercase text-[10px] font-bold tracking-widest">
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4">Last Heartbeat</th>
                    <th className="px-6 py-4">System</th>
                    <th className="px-6 py-4">Registered</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-outline-variant/10">
                  {runnerList.map((runner) => {
                    const badge = STATUS_BADGE[runner.status] ?? STATUS_BADGE.offline;
                    const sysInfo = runner.system_info as { os?: string; arch?: string } | null;
                    return (
                      <tr key={runner.id} className="hover:bg-surface-container transition-colors">
                        <td className="px-6 py-4 font-semibold text-on-surface">
                          {runner.name}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase ${badge.badgeClass}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-on-surface-variant font-mono">
                          {runner.last_heartbeat_at
                            ? formatDate(runner.last_heartbeat_at)
                            : "—"}
                        </td>
                        <td className="px-6 py-4 text-xs text-on-surface-variant">
                          {sysInfo
                            ? `${sysInfo.os ?? "?"} ${sysInfo.arch ?? "?"}`
                            : "—"}
                        </td>
                        <td className="px-6 py-4 text-xs text-on-surface-variant">
                          {formatDateShort(runner.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* System Events */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs uppercase font-bold tracking-widest text-on-surface-variant">
              Recent System Events
            </h3>
          </div>
          <div className="bg-surface-container-lowest rounded p-6 font-mono text-[13px] leading-relaxed border border-outline-variant/10 shadow-inner">
            <p className="text-on-surface-variant/50 text-center text-xs">
              No recent system events
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
