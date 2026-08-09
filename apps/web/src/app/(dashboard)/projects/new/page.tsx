"use client";

import Link from "next/link";
import { useActionState, useState, useEffect } from "react";

import { TopBar } from "@/components/layout/top-bar";
import { GitHubRepoPicker } from "@/components/projects/github-repo-picker";
import { GitHubConnectPrompt } from "@/components/projects/github-connect-prompt";
import { createProject, type ActionState } from "../actions";
import type { GitHubRepo } from "@/lib/github";

type SourceTab = "github" | "url";

interface GitHubStatus {
  readonly connected: boolean;
  readonly username?: string;
}

const initialState: ActionState = {};

export default function NewProjectPage() {
  const [state, formAction, pending] = useActionState(createProject, initialState);
  const [tab, setTab] = useState<SourceTab>("github");
  const [ghStatus, setGhStatus] = useState<GitHubStatus | null>(null);
  const [ghLoading, setGhLoading] = useState(true);

  // Selected repo state (from picker)
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [projectName, setProjectName] = useState("");

  // Check GitHub connection status on mount
  useEffect(() => {
    fetch("/api/github/status")
      .then((r) => r.json())
      .then((data) => setGhStatus(data))
      .catch(() => setGhStatus({ connected: false }))
      .finally(() => setGhLoading(false));
  }, []);

  function handleRepoSelect(repo: GitHubRepo, branchList: string[]) {
    setSelectedRepo(repo);
    setBranches(branchList);
    setSelectedBranch(repo.default_branch);
    // Auto-fill project name from repo name
    setProjectName(repo.name);
  }

  function handleClearSelection() {
    setSelectedRepo(null);
    setBranches([]);
    setSelectedBranch("main");
    setProjectName("");
  }

  return (
    <>
      <TopBar
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: "New Project" },
        ]}
      />
      <section className="flex-1 flex items-center justify-center p-8 relative">
        {/* Background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 blur-[120px] rounded-full -z-10" />

        <div className="w-full max-w-2xl">
          <div className="mb-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-on-surface mb-2">
              Create New Project
            </h2>
            <p className="text-on-surface-variant text-sm">
              Import from GitHub or enter a Git repository URL.
            </p>
          </div>

          <div className="bg-surface-container rounded-xl overflow-hidden shadow-2xl border border-outline-variant/10">
            {/* Tab switcher */}
            <div className="flex border-b border-outline-variant/10">
              <button
                type="button"
                onClick={() => setTab("github")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                  tab === "github"
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                }`}
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
                Import from GitHub
              </button>
              <button
                type="button"
                onClick={() => setTab("url")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                  tab === "url"
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                }`}
              >
                <span className="material-symbols-outlined text-sm">link</span>
                Enter URL
              </button>
            </div>

            {/* GitHub tab content */}
            {tab === "github" && (
              <div>
                {ghLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <span className="material-symbols-outlined text-xl text-on-surface-variant/40 animate-spin">
                      progress_activity
                    </span>
                  </div>
                ) : !ghStatus?.connected ? (
                  <GitHubConnectPrompt />
                ) : !selectedRepo ? (
                  <div className="p-6">
                    <GitHubRepoPicker
                      username={ghStatus.username ?? ""}
                      onSelect={handleRepoSelect}
                    />
                  </div>
                ) : (
                  /* Selected repo → show config form */
                  <GitHubConfigForm
                    repo={selectedRepo}
                    branches={branches}
                    selectedBranch={selectedBranch}
                    onBranchChange={setSelectedBranch}
                    projectName={projectName}
                    onProjectNameChange={setProjectName}
                    onBack={handleClearSelection}
                    formAction={formAction}
                    state={state}
                    pending={pending}
                  />
                )}
              </div>
            )}

            {/* URL tab content — original manual form */}
            {tab === "url" && (
              <ManualUrlForm
                formAction={formAction}
                state={state}
                pending={pending}
              />
            )}
          </div>

          {/* Repository requirements */}
          <RepoRequirements />
        </div>
      </section>
    </>
  );
}

/* ─── GitHub Config Form (after repo selection) ─── */

function GitHubConfigForm({
  repo,
  branches,
  selectedBranch,
  onBranchChange,
  projectName,
  onProjectNameChange,
  onBack,
  formAction,
  state,
  pending,
}: {
  readonly repo: GitHubRepo;
  readonly branches: string[];
  readonly selectedBranch: string;
  readonly onBranchChange: (b: string) => void;
  readonly projectName: string;
  readonly onProjectNameChange: (n: string) => void;
  readonly onBack: () => void;
  readonly formAction: (payload: FormData) => void;
  readonly state: ActionState;
  readonly pending: boolean;
}) {
  return (
    <form action={formAction} className="p-8 space-y-6">
      {state.error && (
        <div className="bg-error/10 border border-error/30 rounded-md p-3 text-xs text-error">
          {state.error}
        </div>
      )}

      {/* Selected repo card */}
      <div className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-md border border-outline-variant/10">
        <img
          src={repo.owner.avatar_url}
          alt={repo.owner.login}
          className="w-8 h-8 rounded-full ring-1 ring-outline-variant/10"
        />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-on-surface">{repo.full_name}</span>
          <span
            className={`ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
              repo.private
                ? "bg-warning-container/20 text-warning"
                : "bg-tertiary-container/20 text-tertiary"
            }`}
          >
            {repo.private ? "private" : "public"}
          </span>
          {repo.description && (
            <p className="text-[10px] text-on-surface-variant/60 truncate mt-0.5">{repo.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-primary font-bold hover:underline flex-shrink-0"
        >
          Change
        </button>
      </div>

      {/* Hidden fields for the repo URL */}
      <input type="hidden" name="git_repo_url" value={repo.html_url} />
      <input type="hidden" name="source" value="github" />

      {/* Project name + Branch */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
            Project Name
          </label>
          <input
            name="name"
            type="text"
            required
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            placeholder="e.g. monolith-api"
            className="w-full bg-surface-container-lowest border-none rounded-md px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all placeholder:text-on-surface-variant/30"
          />
          <FieldError errors={state.fieldErrors?.name} />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
            Branch
          </label>
          {branches.length > 0 ? (
            <div className="relative">
              <select
                name="default_branch"
                value={selectedBranch}
                onChange={(e) => onBranchChange(e.target.value)}
                className="w-full appearance-none bg-surface-container-lowest border-none rounded-md px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all font-mono"
              >
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant/50">
                expand_more
              </span>
            </div>
          ) : (
            <input
              name="default_branch"
              type="text"
              value={selectedBranch}
              onChange={(e) => onBranchChange(e.target.value)}
              className="w-full bg-surface-container-lowest border-none rounded-md px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all font-mono"
            />
          )}
        </div>
      </div>

      {/* Deploy target */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
          Deploy Target
        </label>
        <div className="relative">
          <select
            name="deploy_target"
            className="w-full appearance-none bg-surface-container-lowest border-none rounded-md px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all"
          >
            <option value="docker_local">Docker Local</option>
            <option value="railway">Railway</option>
            <option value="fly_io">Fly.io</option>
          </select>
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant/50">
            expand_more
          </span>
        </div>
      </div>

      {/* Advanced Config */}
      <div className="pt-4 border-t border-outline-variant/10 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
            Dockerfile Path
          </label>
          <div className="flex items-center bg-surface-container-lowest rounded-md px-3 py-2">
            <span className="material-symbols-outlined text-xs text-on-surface-variant/50 mr-2">
              description
            </span>
            <input
              name="dockerfile_path"
              type="text"
              defaultValue="./Dockerfile"
              className="bg-transparent border-none p-0 text-xs text-on-surface w-full focus:ring-0 font-mono"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
            Build Context
          </label>
          <div className="flex items-center bg-surface-container-lowest rounded-md px-3 py-2">
            <span className="material-symbols-outlined text-xs text-on-surface-variant/50 mr-2">
              folder
            </span>
            <input
              name="build_context"
              type="text"
              defaultValue="."
              className="bg-transparent border-none p-0 text-xs text-on-surface w-full focus:ring-0 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-4 pt-6">
        <Link
          href="/projects"
          className="px-6 py-2.5 rounded-md text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="px-8 py-2.5 rounded-md text-sm font-bold bg-gradient-to-br from-primary to-primary-container text-on-primary-container shadow-lg shadow-primary/10 hover:opacity-90 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? (
            <span className="material-symbols-outlined text-sm animate-spin">
              progress_activity
            </span>
          ) : (
            <span className="material-symbols-outlined text-sm">add</span>
          )}
          {pending ? "Creating..." : "Create Project"}
        </button>
      </div>
    </form>
  );
}

/* ─── Manual URL Form (original form, preserved) ─── */

function ManualUrlForm({
  formAction,
  state,
  pending,
}: {
  readonly formAction: (payload: FormData) => void;
  readonly state: ActionState;
  readonly pending: boolean;
}) {
  return (
    <form action={formAction} className="p-8 space-y-8">
      {state.error && (
        <div className="bg-error/10 border border-error/30 rounded-md p-3 text-xs text-error">
          {state.error}
        </div>
      )}

      {/* Identity Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
            Project Name
          </label>
          <input
            name="name"
            type="text"
            required
            placeholder="e.g. monolith-api"
            className="w-full bg-surface-container-lowest border-none rounded-md px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all placeholder:text-on-surface-variant/30"
          />
          <FieldError errors={state.fieldErrors?.name} />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
            Deploy Target
          </label>
          <div className="relative">
            <select
              name="deploy_target"
              className="w-full appearance-none bg-surface-container-lowest border-none rounded-md px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all"
            >
              <option value="docker_local">Docker Local</option>
              <option value="railway">Railway</option>
              <option value="fly_io">Fly.io</option>
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant/50">
              expand_more
            </span>
          </div>
          <FieldError errors={state.fieldErrors?.deploy_target} />
        </div>
      </div>

      {/* Source Control */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
          Git Repository URL
        </label>
        <div className="relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center pr-3 border-r border-outline-variant/20">
            <span className="material-symbols-outlined text-on-surface-variant/40 group-focus-within:text-primary transition-colors">
              link
            </span>
          </div>
          <input
            name="git_repo_url"
            type="url"
            required
            placeholder="https://github.com/org/repo"
            className="w-full bg-surface-container-lowest border-none rounded-md pl-14 pr-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all placeholder:text-on-surface-variant/30"
          />
        </div>
        <FieldError errors={state.fieldErrors?.git_repo_url} />
      </div>

      {/* Advanced Config */}
      <div className="pt-4 border-t border-outline-variant/10 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
            Default Branch
          </label>
          <div className="flex items-center bg-surface-container-lowest rounded-md px-3 py-2">
            <span className="material-symbols-outlined text-xs text-on-surface-variant/50 mr-2">
              account_tree
            </span>
            <input
              name="default_branch"
              type="text"
              defaultValue="main"
              className="bg-transparent border-none p-0 text-xs text-on-surface w-full focus:ring-0 font-mono"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
            Dockerfile Path
          </label>
          <div className="flex items-center bg-surface-container-lowest rounded-md px-3 py-2">
            <span className="material-symbols-outlined text-xs text-on-surface-variant/50 mr-2">
              description
            </span>
            <input
              name="dockerfile_path"
              type="text"
              defaultValue="./Dockerfile"
              className="bg-transparent border-none p-0 text-xs text-on-surface w-full focus:ring-0 font-mono"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
            Build Context
          </label>
          <div className="flex items-center bg-surface-container-lowest rounded-md px-3 py-2">
            <span className="material-symbols-outlined text-xs text-on-surface-variant/50 mr-2">
              folder
            </span>
            <input
              name="build_context"
              type="text"
              defaultValue="."
              className="bg-transparent border-none p-0 text-xs text-on-surface w-full focus:ring-0 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-4 pt-6">
        <Link
          href="/projects"
          className="px-6 py-2.5 rounded-md text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="px-8 py-2.5 rounded-md text-sm font-bold bg-gradient-to-br from-primary to-primary-container text-on-primary-container shadow-lg shadow-primary/10 hover:opacity-90 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? (
            <span className="material-symbols-outlined text-sm animate-spin">
              progress_activity
            </span>
          ) : (
            <span className="material-symbols-outlined text-sm">add</span>
          )}
          {pending ? "Creating..." : "Create Project"}
        </button>
      </div>
    </form>
  );
}

/* ─── Shared Components ─── */

function FieldError({ errors }: { readonly errors?: readonly string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-error mt-1 ml-1">{errors[0]}</p>;
}

function RepoRequirements() {
  return (
    <details className="mt-6 group">
      <summary className="flex items-center gap-3 px-4 py-3 bg-tertiary-container/10 rounded-md border border-tertiary-container/20 cursor-pointer select-none hover:bg-tertiary-container/15 transition-colors">
        <span className="material-symbols-outlined text-tertiary text-sm">info</span>
        <span className="text-xs text-tertiary/80 font-semibold">Repository Requirements</span>
        <span className="material-symbols-outlined text-tertiary/50 text-sm ml-auto transition-transform group-open:rotate-180">
          expand_more
        </span>
      </summary>
      <div className="mt-2 px-4 py-3 bg-surface-container-low rounded-md border border-outline-variant/10 space-y-3">
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Your Git repository needs:
        </p>
        <ul className="text-xs text-on-surface-variant/80 space-y-2 ml-1">
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined text-tertiary text-sm mt-0.5">check_circle</span>
            <span>A <code className="text-primary font-mono text-[11px]">Dockerfile</code> at the configured path</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined text-tertiary text-sm mt-0.5">check_circle</span>
            <span>A health check endpoint at <code className="text-primary font-mono text-[11px]">GET /health</code> returning HTTP 200</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined text-tertiary text-sm mt-0.5">check_circle</span>
            <span>App reads port from <code className="text-primary font-mono text-[11px]">PORT</code> environment variable</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined text-tertiary text-sm mt-0.5">check_circle</span>
            <span>Graceful shutdown on <code className="text-primary font-mono text-[11px]">SIGTERM</code> signal</span>
          </li>
        </ul>
      </div>
    </details>
  );
}
