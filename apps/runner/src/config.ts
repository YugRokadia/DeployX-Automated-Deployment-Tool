import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface RunnerConfig {
  readonly runner_id: string;
  readonly token: string;
  readonly control_plane_url: string;
  readonly name: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".deployx");
const RUNNERS_DIR = path.join(CONFIG_DIR, "runners");
const LEGACY_CONFIG_FILE = path.join(CONFIG_DIR, "runner.json");

/**
 * Migrate old single-file config (~/.deployx/runner.json)
 * to new multi-runner format (~/.deployx/runners/{name}.json).
 * Called automatically before any config operation.
 */
function migrateLegacyConfig(): void {
  try {
    if (!fs.existsSync(LEGACY_CONFIG_FILE)) return;
    if (fs.existsSync(RUNNERS_DIR) && fs.readdirSync(RUNNERS_DIR).length > 0) return;

    const raw = fs.readFileSync(LEGACY_CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.name !== "string") return;

    fs.mkdirSync(RUNNERS_DIR, { recursive: true });
    const newPath = path.join(RUNNERS_DIR, `${sanitizeProfile(parsed.name)}.json`);
    fs.writeFileSync(newPath, raw, "utf-8");
    fs.chmodSync(newPath, 0o600);
    fs.unlinkSync(LEGACY_CONFIG_FILE);

    console.log(`Migrated runner config to multi-runner format: ${newPath}`);
  } catch {
    // Migration is best-effort — don't block on failure
  }
}

/**
 * Sanitize profile name for use as filename.
 * Removes path separators and special characters.
 */
function sanitizeProfile(profile: string): string {
  return profile.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * List all registered runner profiles.
 * Returns profile names (filename without .json extension).
 */
export function listProfiles(): string[] {
  migrateLegacyConfig();
  try {
    const files = fs.readdirSync(RUNNERS_DIR);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

/**
 * Resolve which profile to use.
 * If profile is given, use it.
 * If not, auto-select if exactly one profile exists.
 * Returns null if ambiguous (multiple profiles, none specified).
 */
export function resolveProfile(profile?: string): string | null {
  if (profile) return sanitizeProfile(profile);

  const profiles = listProfiles();
  if (profiles.length === 1) return profiles[0];
  return null;
}

/**
 * Get the config file path for a given profile.
 */
export function getConfigPath(profile?: string): string {
  const resolved = profile ? sanitizeProfile(profile) : null;
  if (resolved) {
    return path.join(RUNNERS_DIR, `${resolved}.json`);
  }
  // Fallback for display purposes when no profile is specified
  return RUNNERS_DIR;
}

/**
 * Load runner config for a specific profile.
 * If no profile given, auto-selects if exactly one exists.
 */
export function loadConfig(profile?: string): RunnerConfig | null {
  migrateLegacyConfig();

  const resolved = resolveProfile(profile);
  if (!resolved) return null;

  try {
    const configPath = path.join(RUNNERS_DIR, `${resolved}.json`);
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.runner_id === "string" &&
      typeof parsed.token === "string" &&
      typeof parsed.control_plane_url === "string" &&
      typeof parsed.name === "string"
    ) {
      return parsed as RunnerConfig;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save runner config for a specific profile.
 */
export function saveConfig(config: RunnerConfig, profile?: string): void {
  const resolved = sanitizeProfile(profile ?? config.name);
  fs.mkdirSync(RUNNERS_DIR, { recursive: true });
  const configPath = path.join(RUNNERS_DIR, `${resolved}.json`);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  // Restrict permissions to owner-only
  fs.chmodSync(configPath, 0o600);
}

/**
 * Delete runner config for a specific profile.
 */
export function deleteConfig(profile?: string): void {
  const resolved = resolveProfile(profile);
  if (!resolved) return;

  try {
    const configPath = path.join(RUNNERS_DIR, `${resolved}.json`);
    fs.unlinkSync(configPath);
  } catch {
    // File doesn't exist — that's fine
  }
}
