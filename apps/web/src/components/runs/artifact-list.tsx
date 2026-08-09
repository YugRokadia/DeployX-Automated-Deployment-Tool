"use client";

import { useState, useTransition } from "react";
import {
  getArtifactDownloadUrl,
  deleteArtifact,
} from "@/app/(dashboard)/projects/[projectId]/artifacts/actions";
import { hasMinRole } from "@deployx/shared";

interface ArtifactData {
  readonly name: string;
  readonly size: number | null;
  readonly created_at: string;
  readonly path: string;
}

interface ArtifactListProps {
  readonly projectId: string;
  readonly artifacts: readonly ArtifactData[];
  readonly currentRole: string;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArtifactList({
  projectId,
  artifacts,
  currentRole,
}: ArtifactListProps) {
  const [isPending, startTransition] = useTransition();
  const isAdmin = hasMinRole(currentRole, "admin");

  async function handleDownload(path: string) {
    const result = await getArtifactDownloadUrl(projectId, path);
    if (result.url) {
      window.open(result.url, "_blank");
    }
  }

  function handleDelete(path: string) {
    startTransition(async () => {
      await deleteArtifact(projectId, path);
    });
  }

  if (artifacts.length === 0) {
    return (
      <div className="text-center py-6 text-on-surface-variant/40 text-sm">
        <span className="material-symbols-outlined text-2xl mb-2 block">
          inventory_2
        </span>
        No artifacts uploaded for this run
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {artifacts.map((artifact) => (
        <div
          key={artifact.path}
          className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-surface-container-high/50 transition-colors"
        >
          <span className="material-symbols-outlined text-on-surface-variant/40">
            description
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-on-surface truncate">{artifact.name}</p>
            <p className="text-[10px] text-on-surface-variant/40">
              {formatBytes(artifact.size)}
            </p>
          </div>
          <button
            onClick={() => handleDownload(artifact.path)}
            disabled={isPending}
            className="p-1.5 hover:bg-primary/10 rounded-md transition-colors"
            title="Download"
          >
            <span className="material-symbols-outlined text-sm text-primary">
              download
            </span>
          </button>
          {isAdmin && (
            <button
              onClick={() => handleDelete(artifact.path)}
              disabled={isPending}
              className="p-1.5 hover:bg-error/10 rounded-md transition-colors"
              title="Delete"
            >
              <span className="material-symbols-outlined text-sm text-error/60">
                delete
              </span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
