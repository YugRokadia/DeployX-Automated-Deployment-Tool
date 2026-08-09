import { decryptSecret } from "@deployx/shared";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Retrieves and decrypts the stored GitHub access token for a user.
 * Returns null if no token is stored or decryption fails.
 */
export async function getDecryptedGitHubToken(
  userId: string,
): Promise<{ token: string; tokenId: string } | null> {
  const secretKey = process.env.DEPLOYX_SECRET_KEY;
  if (!secretKey) return null;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("github_tokens")
    .select("id, encrypted_token")
    .eq("user_id", userId)
    .single();

  if (!data) return null;

  try {
    const token = decryptSecret(data.encrypted_token, secretKey);
    return { token, tokenId: data.id };
  } catch {
    return null;
  }
}

/** Trimmed GitHub repo shape returned by our API routes. */
export interface GitHubRepo {
  readonly id: number;
  readonly full_name: string;
  readonly name: string;
  readonly owner: { readonly login: string; readonly avatar_url: string };
  readonly private: boolean;
  readonly default_branch: string;
  readonly description: string | null;
  readonly language: string | null;
  readonly updated_at: string;
  readonly html_url: string;
}

/** Trims a raw GitHub API repo object to only the fields we need. */
export function trimRepo(raw: Record<string, unknown>): GitHubRepo {
  const owner = raw.owner as Record<string, unknown>;
  return {
    id: raw.id as number,
    full_name: raw.full_name as string,
    name: raw.name as string,
    owner: {
      login: owner.login as string,
      avatar_url: owner.avatar_url as string,
    },
    private: raw.private as boolean,
    default_branch: raw.default_branch as string,
    description: (raw.description as string) ?? null,
    language: (raw.language as string) ?? null,
    updated_at: raw.updated_at as string,
    html_url: raw.html_url as string,
  };
}
