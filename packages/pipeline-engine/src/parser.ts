import yaml from "js-yaml";
import { PipelineConfigSchema, type PipelineConfig } from "@deployx/shared";

/**
 * Parse a deployx.yaml string into a validated PipelineConfig.
 * Throws on invalid YAML syntax or schema violations.
 */
export function parsePipelineYaml(yamlString: string): PipelineConfig {
  const result = tryParsePipelineYaml(yamlString);
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.data;
}

/**
 * Safe version — returns a discriminated union instead of throwing.
 * Ideal for UI validation where you want to display errors inline.
 */
export function tryParsePipelineYaml(
  yamlString: string,
):
  | { readonly success: true; readonly data: PipelineConfig }
  | { readonly success: false; readonly error: string } {
  if (!yamlString || yamlString.trim().length === 0) {
    return { success: false, error: "Pipeline YAML is empty" };
  }

  // Step 1: Parse YAML syntax
  let raw: unknown;
  try {
    raw = yaml.load(yamlString, { schema: yaml.DEFAULT_SCHEMA });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid YAML syntax";
    return { success: false, error: `YAML syntax error: ${message}` };
  }

  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      success: false,
      error: "Pipeline YAML must be a YAML mapping (object), not a scalar or array",
    };
  }

  // Step 2: Validate against Zod schema
  const parsed = PipelineConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    });
    return {
      success: false,
      error: `Pipeline validation failed:\n${messages.join("\n")}`,
    };
  }

  return { success: true, data: parsed.data };
}
