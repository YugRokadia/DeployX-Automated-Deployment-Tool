import { z } from "zod";

/**
 * Schema for a GitHub push event payload.
 * Validates only the fields DeployX needs — GitHub sends many more.
 */
export const GitHubPushEventSchema = z.object({
  ref: z.string().min(1, "ref is required"),
  after: z.string().min(1, "after (commit SHA) is required"),
  repository: z.object({
    full_name: z.string(),
  }),
  head_commit: z
    .object({
      id: z.string(),
      message: z.string(),
      author: z.object({
        name: z.string(),
        email: z.string(),
      }),
    })
    .nullable(),
  deleted: z.boolean().optional(),
});

export type GitHubPushEvent = z.infer<typeof GitHubPushEventSchema>;

/**
 * Schema for creating/updating a webhook configuration.
 */
export const WebhookConfigSchema = z.object({
  branch_filter: z
    .string()
    .trim()
    .max(255, "Branch filter must be 255 characters or fewer")
    .optional()
    .nullable(),
  pipeline_definition_id: z.string().uuid("Invalid pipeline definition ID").optional().nullable(),
});

export type WebhookConfigInput = z.infer<typeof WebhookConfigSchema>;

/**
 * Extracts a branch name from a Git ref string.
 * e.g., "refs/heads/main" → "main", "refs/heads/feature/foo" → "feature/foo"
 */
export function extractBranchFromRef(ref: string): string | null {
  const prefix = "refs/heads/";
  if (!ref.startsWith(prefix)) {
    return null;
  }
  return ref.slice(prefix.length);
}

/**
 * Checks if a branch name matches a filter pattern.
 * Supports exact match and simple glob patterns with * wildcard.
 * Returns true if no filter is set (null/empty = match all).
 */
export function matchesBranchFilter(
  branch: string,
  filter: string | null | undefined,
): boolean {
  if (!filter || filter.trim() === "") {
    return true;
  }

  const trimmed = filter.trim();

  // Exact match
  if (trimmed === branch) {
    return true;
  }

  // Simple glob: convert * to regex .* and ** to .*
  const escaped = trimmed
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/(?<!\.)\*/g, "[^/]*");

  const regex = new RegExp(`^${escaped}$`);
  return regex.test(branch);
}
