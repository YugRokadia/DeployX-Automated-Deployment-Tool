"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

/**
 * Shown when the user hasn't connected their GitHub account with `repo` scope.
 * Triggers re-authentication with the expanded scope.
 */
export function GitHubConnectPrompt() {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/projects/new`,
        scopes: "repo",
      },
    });
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      <div className="w-14 h-14 rounded-full bg-surface-container-highest flex items-center justify-center mb-5">
        <svg className="w-7 h-7 fill-on-surface-variant/60" viewBox="0 0 24 24">
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-on-surface mb-1">
        Connect your GitHub account
      </h3>
      <p className="text-xs text-on-surface-variant text-center max-w-xs mb-6">
        Grant repository access to browse and import your GitHub repositories,
        including private repos.
      </p>
      <button
        onClick={handleConnect}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-surface-container-lowest border border-outline-variant/50 text-on-surface text-sm font-semibold rounded-md hover:bg-surface-bright active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {loading ? (
          <span className="material-symbols-outlined text-sm animate-spin">
            progress_activity
          </span>
        ) : (
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        )}
        {loading ? "Redirecting..." : "Connect GitHub"}
      </button>
    </div>
  );
}
