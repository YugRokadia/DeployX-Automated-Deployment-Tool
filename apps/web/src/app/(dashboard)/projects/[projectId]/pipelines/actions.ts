"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserWithOrg } from "@/lib/auth/session";
import { parsePipelineYaml, tryParsePipelineYaml } from "@deployx/pipeline-engine";
import { hasMinRole } from "@deployx/shared";

export interface PipelineActionState {
  readonly error?: string;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Create a new pipeline definition with an initial version.
 */
export async function createPipelineDefinition(
  projectId: string,
  _prev: PipelineActionState,
  formData: FormData,
): Promise<PipelineActionState> {
  const { supabase, user, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to create pipelines" };
  }

  const name = (formData.get("name") as string | null)?.trim();
  const yamlSource = (formData.get("yaml_source") as string | null)?.trim();

  if (!name || name.length === 0) {
    return { fieldErrors: { name: ["Pipeline name is required"] } };
  }

  if (!yamlSource || yamlSource.length === 0) {
    return { fieldErrors: { yaml_source: ["Pipeline YAML is required"] } };
  }

  // Validate YAML
  const parseResult = tryParsePipelineYaml(yamlSource);
  if (!parseResult.success) {
    return { fieldErrors: { yaml_source: [parseResult.error] } };
  }

  // Create pipeline definition
  const { data: definition, error: defError } = await supabase
    .from("pipeline_definitions")
    .insert({
      project_id: projectId,
      name,
    })
    .select("id")
    .single();

  if (defError) {
    if (defError.code === "23505") {
      return { fieldErrors: { name: ["A pipeline with this name already exists in this project"] } };
    }
    return { error: "Failed to create pipeline definition" };
  }

  // Create version 1
  const { data: version, error: verError } = await supabase
    .from("pipeline_definition_versions")
    .insert({
      pipeline_definition_id: definition.id,
      version: 1,
      config_json: parseResult.data,
      yaml_source: yamlSource,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (verError) {
    return { error: "Failed to create pipeline version" };
  }

  // Update current_version_id
  await supabase
    .from("pipeline_definitions")
    .update({ current_version_id: version.id })
    .eq("id", definition.id);

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

/**
 * Trigger a pipeline run for a given pipeline definition.
 */
export async function triggerPipelineRun(
  projectId: string,
  definitionId: string,
): Promise<{ error?: string; run_id?: string }> {
  const { supabase, user, role } = await requireUserWithOrg();

  if (!hasMinRole(role, "developer")) {
    return { error: "You don't have permission to trigger pipelines" };
  }

  // Get the current version of the pipeline definition
  const { data: definition } = await supabase
    .from("pipeline_definitions")
    .select("id, current_version_id")
    .eq("id", definitionId)
    .single();

  if (!definition?.current_version_id) {
    return { error: "Pipeline definition has no version" };
  }

  // Get the project's git info
  const { data: project } = await supabase
    .from("projects")
    .select("default_branch, git_repo_url")
    .eq("id", projectId)
    .single();

  // Create pipeline run with status 'created'
  const { data: run, error: runError } = await supabase
    .from("pipeline_runs")
    .insert({
      pipeline_definition_id: definitionId,
      pipeline_version_id: definition.current_version_id,
      project_id: projectId,
      status: "created",
      trigger_type: "manual",
      git_branch: project?.default_branch ?? "main",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (runError) {
    return { error: "Failed to create pipeline run" };
  }

  // Transition to 'queued' so the runner can pick it up
  const { error: queueError } = await supabase
    .from("pipeline_runs")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .eq("id", run.id);

  if (queueError) {
    return { error: "Failed to queue pipeline run" };
  }

  revalidatePath(`/projects/${projectId}`);

  return { run_id: run.id };
}
