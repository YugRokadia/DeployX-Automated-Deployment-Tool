import Link from "next/link";

import { TopBar } from "@/components/layout/top-bar";
import { ProjectCard } from "@/components/projects/project-card";
import { requireUserWithOrg } from "@/lib/auth/session";

export default async function ProjectsPage() {
  const { supabase, org } = await requireUserWithOrg();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, slug, git_repo_url, deploy_target, created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <TopBar breadcrumbs={[{ label: "Projects" }]} />
      <main className="p-8 flex-1 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-on-surface">
              Projects
            </h2>
            <p className="text-on-surface-variant text-sm mt-1">
              Manage and monitor your active deployment pipelines.
            </p>
          </div>
          <Link
            href="/projects/new"
            className="flex items-center gap-2 bg-primary-container text-on-primary-container px-4 py-2.5 rounded-md font-semibold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/10"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New Project
          </Link>
        </div>

        {/* Projects Grid */}
        {!projects || projects.length === 0 ? (
          <div className="bg-surface-container rounded-xl p-16 text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4 block">
              account_tree
            </span>
            <p className="text-sm text-on-surface-variant font-medium">
              No projects yet
            </p>
            <p className="text-xs text-on-surface-variant/60 mt-1 mb-6">
              Create your first project to start building pipelines
            </p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 bg-primary-container text-on-primary-container px-4 py-2 rounded-md font-semibold text-xs hover:opacity-90 transition-all"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              New Project
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <ProjectCard
                  id={project.id}
                  name={project.name}
                  git_repo_url={project.git_repo_url}
                  last_pipeline_status={null}
                  last_deploy_time={null}
                  last_build_duration={null}
                  last_commit_sha={null}
                />
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
