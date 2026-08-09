export interface VariableContext {
  readonly git: {
    readonly sha: string;
    readonly short_sha: string;
    readonly branch: string;
  };
  readonly project: {
    readonly name: string;
    readonly slug: string;
  };
  readonly env: Readonly<Record<string, string | undefined>>;
}

const VARIABLE_PATTERN = /\$\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;

/**
 * Resolves `${{ ... }}` variable expressions in a template string.
 *
 * Supported variables:
 * - git.sha, git.short_sha, git.branch
 * - project.name, project.slug
 * - env.VARNAME (from context.env, falls back to empty string)
 *
 * Unknown variables are left as-is and a warning is logged.
 */
export function resolveVariables(
  template: string,
  context: VariableContext,
): string {
  return template.replace(VARIABLE_PATTERN, (match, path: string) => {
    const value = lookupPath(path, context);
    if (value === undefined) {
      console.warn(`Unknown variable: ${path}`);
      return match;
    }
    return value;
  });
}

function lookupPath(
  path: string,
  context: VariableContext,
): string | undefined {
  const segments = path.split(".");

  if (segments[0] === "git" && segments.length === 2) {
    const key = segments[1] as keyof VariableContext["git"];
    return context.git[key];
  }

  if (segments[0] === "project" && segments.length === 2) {
    const key = segments[1] as keyof VariableContext["project"];
    return context.project[key];
  }

  if (segments[0] === "env" && segments.length === 2) {
    return context.env[segments[1]] ?? "";
  }

  return undefined;
}
