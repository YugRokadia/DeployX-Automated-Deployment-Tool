"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useParams } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";
import {
  createPipelineDefinition,
  type PipelineActionState,
} from "../actions";
import { tryParsePipelineYaml } from "@deployx/pipeline-engine";
import { useState } from "react";

const SAMPLE_YAML = `name: my-pipeline
tasks:
  build:
    steps:
      - name: Compile
        command: npm run build
  test:
    depends_on: [build]
    steps:
      - name: Run tests
        command: npm test
`;

const initialState: PipelineActionState = {};

export default function NewPipelinePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const boundAction = createPipelineDefinition.bind(null, projectId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [yamlPreview, setYamlPreview] = useState<string | null>(null);

  const handleYamlChange = (value: string) => {
    if (!value.trim()) {
      setYamlPreview(null);
      return;
    }
    const result = tryParsePipelineYaml(value);
    setYamlPreview(
      result.success
        ? `Valid — ${Object.keys(result.data.tasks).length} task(s)`
        : result.error,
    );
  };

  return (
    <>
      <TopBar
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: "Project", href: `/projects/${projectId}` },
          { label: "Pipelines", href: `/projects/${projectId}/pipelines` },
          { label: "New Pipeline" },
        ]}
      />
      <section className="flex-1 flex items-start justify-center p-8">
        <div className="w-full max-w-3xl">
          <div className="mb-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-on-surface mb-2">
              Create Pipeline
            </h2>
            <p className="text-on-surface-variant text-sm">
              Define your CI/CD pipeline using YAML.
            </p>
          </div>

          <div className="bg-surface-container rounded-xl overflow-hidden shadow-2xl border border-outline-variant/10">
            <form action={formAction} className="p-8 space-y-6">
              {state.error && (
                <div className="bg-error/10 border border-error/30 rounded-md p-3 text-xs text-error">
                  {state.error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
                  Pipeline Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. build-and-deploy"
                  className="w-full bg-surface-container-lowest border-none rounded-md px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all placeholder:text-on-surface-variant/30"
                />
                {state.fieldErrors?.name && (
                  <p className="text-xs text-error mt-1 ml-1">
                    {state.fieldErrors.name[0]}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest ml-1">
                  Pipeline YAML
                </label>
                <textarea
                  name="yaml_source"
                  required
                  rows={16}
                  defaultValue={SAMPLE_YAML}
                  onChange={(e) => handleYamlChange(e.target.value)}
                  className="w-full bg-surface-container-lowest border-none rounded-md px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all font-mono leading-relaxed resize-y"
                  spellCheck={false}
                />
                {yamlPreview && (
                  <p
                    className={`text-xs mt-1 ml-1 ${
                      yamlPreview.startsWith("Valid")
                        ? "text-tertiary"
                        : "text-error"
                    }`}
                  >
                    {yamlPreview}
                  </p>
                )}
                {state.fieldErrors?.yaml_source && (
                  <p className="text-xs text-error mt-1 ml-1 whitespace-pre-wrap">
                    {state.fieldErrors.yaml_source[0]}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-4 pt-4">
                <Link
                  href={`/projects/${projectId}/pipelines`}
                  className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-md hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {pending && (
                    <span className="material-symbols-outlined text-sm animate-spin">
                      progress_activity
                    </span>
                  )}
                  {pending ? "Creating..." : "Create Pipeline"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
