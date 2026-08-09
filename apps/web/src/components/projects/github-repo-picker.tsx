"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { GitHubRepo } from "@/lib/github";
import { formatDate } from "@/lib/format-date";

interface GitHubRepoPickerProps {
  readonly username: string;
  readonly onSelect: (repo: GitHubRepo, branches: string[]) => void;
}

export function GitHubRepoPicker({ username, onSelect }: GitHubRepoPickerProps) {
  const [search, setSearch] = useState("");
  const [repos, setRepos] = useState<readonly GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRepos = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ per_page: "30" });
      if (query) params.set("search", query);
      const res = await fetch(`/api/github/repos?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to fetch repositories");
      }
      const data = await res.json();
      setRepos(data.repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch repositories");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchRepos("");
  }, [fetchRepos]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchRepos(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, fetchRepos]);

  async function handleSelect(repo: GitHubRepo) {
    setSelectedId(repo.id);
    setLoadingBranches(true);
    try {
      const res = await fetch(
        `/api/github/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/branches`,
      );
      const data = await res.json();
      const branchNames: string[] = (data.branches ?? []).map((b: { name: string }) => b.name);
      onSelect(repo, branchNames);
    } catch {
      onSelect(repo, [repo.default_branch]);
    } finally {
      setLoadingBranches(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Connected indicator */}
      <div className="flex items-center gap-2 px-1">
        <span className="w-2 h-2 rounded-full bg-tertiary" />
        <span className="text-[10px] text-on-surface-variant font-medium">
          Connected as <span className="text-on-surface font-bold">@{username}</span>
        </span>
      </div>

      {/* Search */}
      <div className="relative group">
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <span className="material-symbols-outlined text-on-surface-variant/40 text-lg group-focus-within:text-primary transition-colors">
            search
          </span>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your repositories..."
          className="w-full bg-surface-container-lowest border-none rounded-md pl-10 pr-4 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all placeholder:text-on-surface-variant/30"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-error/10 border border-error/30 rounded-md p-3 text-xs text-error">
          {error}
        </div>
      )}

      {/* Repo list */}
      <div className="max-h-[320px] overflow-y-auto rounded-md border border-outline-variant/10 divide-y divide-outline-variant/5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="material-symbols-outlined text-xl text-on-surface-variant/40 animate-spin">
              progress_activity
            </span>
          </div>
        ) : repos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/20 mb-2">
              folder_off
            </span>
            <p className="text-xs text-on-surface-variant">
              {search ? "No repositories match your search" : "No repositories found"}
            </p>
          </div>
        ) : (
          repos.map((repo) => (
            <button
              key={repo.id}
              type="button"
              onClick={() => handleSelect(repo)}
              disabled={loadingBranches && selectedId === repo.id}
              className={`w-full text-left px-4 py-3 hover:bg-surface-container transition-colors flex items-center gap-3 group/item ${
                selectedId === repo.id ? "bg-primary/5 ring-1 ring-primary/20" : ""
              }`}
            >
              {/* Owner avatar */}
              <img
                src={repo.owner.avatar_url}
                alt={repo.owner.login}
                className="w-7 h-7 rounded-full ring-1 ring-outline-variant/10 flex-shrink-0"
              />

              {/* Repo info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-on-surface truncate">
                    {repo.full_name}
                  </span>
                  <span
                    className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      repo.private
                        ? "bg-warning-container/20 text-warning"
                        : "bg-tertiary-container/20 text-tertiary"
                    }`}
                  >
                    {repo.private ? "private" : "public"}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {repo.language && (
                    <span className="text-[10px] text-on-surface-variant/60">{repo.language}</span>
                  )}
                  <span className="text-[10px] text-on-surface-variant/40">
                    Updated {formatDate(repo.updated_at)}
                  </span>
                </div>
              </div>

              {/* Loading indicator or arrow */}
              {loadingBranches && selectedId === repo.id ? (
                <span className="material-symbols-outlined text-sm text-primary animate-spin flex-shrink-0">
                  progress_activity
                </span>
              ) : (
                <span className="material-symbols-outlined text-sm text-on-surface-variant/30 group-hover/item:text-primary transition-colors flex-shrink-0">
                  arrow_forward
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
