"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGitHubLogin() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "repo",
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="relative flex items-center justify-center min-h-screen p-6 overflow-hidden bg-dot-pattern">
      {/* Background Glow */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[60%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[60%] rounded-full bg-tertiary/5 blur-[120px]" />
      </div>

      <main className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-16 h-16 mb-6 flex items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-container shadow-2xl shadow-primary/20">
            <span className="material-symbols-outlined text-on-primary text-4xl">
              rocket_launch
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tighter text-on-surface mb-2">
            DeployX
          </h1>
          <p className="text-on-surface-variant font-medium tracking-tight">
            Cloud-native CI/CD platform
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card border border-outline-variant/30 rounded-xl p-8 shadow-2xl relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-on-surface mb-1">
                Welcome back
              </h2>
              <p className="text-xs text-on-surface-variant">
                Access your high-precision infrastructure engine
              </p>
            </div>

            {error && (
              <div className="bg-error/10 border border-error/30 rounded-md p-3 text-xs text-error text-center">
                {error}
              </div>
            )}

            {/* GitHub OAuth Button */}
            <button
              onClick={handleGitHubLogin}
              disabled={loading}
              className="w-full group flex items-center justify-center gap-3 bg-surface-container-lowest border border-outline-variant/50 text-on-surface font-semibold py-3.5 px-4 rounded-md transition-all duration-200 hover:bg-surface-bright active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="material-symbols-outlined text-xl animate-spin">
                  progress_activity
                </span>
              ) : (
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
              )}
              <span>{loading ? "Redirecting to GitHub..." : "Sign in with GitHub"}</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 py-2">
              <div className="h-[1px] flex-1 bg-outline-variant/30" />
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant/50 font-bold">
                Secure Access
              </span>
              <div className="h-[1px] flex-1 bg-outline-variant/30" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <p className="text-[11px] font-medium text-on-surface-variant tracking-wider flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
            Free and open source
          </p>
          <div className="flex gap-6">
            <span className="text-[10px] text-on-surface-variant/40">
              Privacy Policy
            </span>
            <span className="text-[10px] text-on-surface-variant/40">
              Terms of Service
            </span>
            <span className="text-[10px] text-on-surface-variant/40">
              Documentation
            </span>
          </div>
        </div>
      </main>

      {/* Decorative terminal snippet */}
      <div className="fixed bottom-10 right-10 opacity-10 pointer-events-none hidden lg:block">
        <div className="bg-surface-container-lowest border border-outline-variant/30 p-4 rounded-lg font-mono text-[10px] text-tertiary leading-relaxed">
          <p>&gt; initializing cluster manager...</p>
          <p>&gt; checking node status: HEALTHY</p>
          <p>&gt; deploying version: 2.4.0</p>
          <p>&gt; pipeline kinetic-engine-x86 active</p>
        </div>
      </div>
    </div>
  );
}
