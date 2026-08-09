"use client";

import { useState, useRef, useActionState } from "react";
import { generateRunnerToken, type GenerateTokenResult } from "./actions";

const initialState: GenerateTokenResult = {};

export function RegisterRunnerDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState(
    generateRunnerToken,
    initialState,
  );
  const nameRef = useRef<HTMLInputElement>(null);

  const handleOpen = () => {
    setIsOpen(true);
    setCopied(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setCopied(false);
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const registerCmd = state.token
    ? `pnpm runner register --token ${state.token} --url ${window.location.origin}`
    : "";
  const startCmd = "pnpm runner start";

  return (
    <>
      <button
        onClick={handleOpen}
        className="px-5 py-2.5 bg-primary text-on-primary font-bold rounded-md hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
      >
        <span className="material-symbols-outlined text-sm">add</span>
        Register Runner
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Dialog */}
          <div className="relative bg-surface-container rounded-xl shadow-2xl border border-outline-variant/10 w-full max-w-lg p-8">
            <h3 className="text-xl font-extrabold text-on-surface mb-2">
              Register New Runner
            </h3>

            {!state.token ? (
              <>
                <p className="text-sm text-on-surface-variant mb-6">
                  Choose a name for this runner. You&apos;ll receive a
                  registration token to use with the CLI.
                </p>

                {state.error && (
                  <div className="bg-error/10 border border-error/30 rounded-md p-3 text-xs text-error mb-4">
                    {state.error}
                  </div>
                )}

                <form action={formAction}>
                  <div className="space-y-2 mb-6">
                    <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">
                      Runner Name
                    </label>
                    <input
                      ref={nameRef}
                      name="name"
                      type="text"
                      required
                      placeholder="e.g. build-server-01"
                      className="w-full bg-surface-container-lowest border-none rounded-md px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all placeholder:text-on-surface-variant/30"
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={pending}
                      className="px-6 py-2 bg-primary text-on-primary text-sm font-bold rounded-md hover:brightness-110 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      {pending && (
                        <span className="material-symbols-outlined text-sm animate-spin">
                          progress_activity
                        </span>
                      )}
                      Generate Token
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <p className="text-sm text-on-surface-variant mb-4">
                  Runner registered! Run these commands from the{" "}
                  <code className="text-primary font-mono text-xs">deployx/</code>{" "}
                  repo root. The token is shown{" "}
                  <span className="text-error font-bold">only once</span>.
                </p>

                {/* Step 1: Register */}
                <div className="mb-3">
                  <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest mb-1.5 ml-1">
                    Step 1 — Register
                  </p>
                  <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-md p-4">
                    <div className="flex items-center justify-between gap-4">
                      <code className="text-xs font-mono text-on-surface break-all leading-relaxed">
                        <span className="text-tertiary select-none">$ </span>
                        {registerCmd}
                      </code>
                      <button
                        onClick={() => handleCopy(registerCmd)}
                        className="shrink-0 flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">
                          {copied ? "check" : "content_copy"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 2: Start */}
                <div className="mb-6">
                  <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest mb-1.5 ml-1">
                    Step 2 — Start polling for jobs
                  </p>
                  <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-md p-4">
                    <div className="flex items-center justify-between gap-4">
                      <code className="text-xs font-mono text-on-surface break-all leading-relaxed">
                        <span className="text-tertiary select-none">$ </span>
                        {startCmd}
                      </code>
                      <button
                        onClick={() => handleCopy(startCmd)}
                        className="shrink-0 flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">
                          content_copy
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleClose}
                    className="px-6 py-2 bg-primary text-on-primary text-sm font-bold rounded-md hover:brightness-110 transition-all"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
