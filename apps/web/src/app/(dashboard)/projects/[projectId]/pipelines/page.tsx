import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";
import { requireUserWithOrg } from "@/lib/auth/session";
import { formatDateShort } from "@/lib/format-date";

interface PageProps {
  readonly params: Promise<{ projectId: string }>;
}

export default async function PipelinesPage({ params }: PageProps) {
  const { projectId } = await params;
  const { supabase } = await requireUserWithOrg();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  const { data: definitions } = await supabase
    .from("pipeline_definitions")
    .select("id, name, current_version_id, created_at, updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const pipelines = definitions ?? [];

  return (
    <>
      <TopBar
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: "Pipelines" },
        ]}
      />
      <div className="p-8 max-w-[1400px] mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-on-surface">
              Pipelines
            </h2>
            <p className="text-on-surface-variant text-sm mt-1">
              Pipeline definitions for {project.name}
            </p>
          </div>
          <Link
            href={`/projects/${projectId}/pipelines/new`}
            className="px-5 py-2.5 bg-primary text-on-primary font-bold rounded-md hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New Pipeline
          </Link>
        </div>

        {pipelines.length === 0 ? (
          <div className="bg-surface-container-low rounded-xl p-12 text-center ring-1 ring-outline-variant/10">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">
              account_tree
            </span>
            <p className="text-sm text-on-surface-variant">No pipelines yet</p>
            <p className="text-xs text-on-surface-variant/60 mt-1">
              Create a pipeline definition to start automating builds
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pipelines.map((p) => (
              <div
                key={p.id}
                className="bg-surface-container-low rounded-xl p-6 ring-1 ring-outline-variant/10 hover:bg-surface-container transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-on-surface">{p.name}</h3>
                    <p className="text-xs text-on-surface-variant mt-1">
                      Created {formatDateShort(p.created_at)}
                      {p.current_version_id ? " — has active version" : " — no version"}
                    </p>
                  </div>
                  <span className="text-[10px] text-on-surface-variant/40 uppercase tracking-wider font-semibold">
                    {p.current_version_id ? "Active" : "Draft"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
