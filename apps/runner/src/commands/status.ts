import { loadConfig, getConfigPath, listProfiles, resolveProfile } from "../config";
import { RunnerApiClient } from "../api-client";

interface StatusOptions {
  readonly profile?: string;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const resolved = resolveProfile(options.profile);

  // If no profile resolved and multiple exist, show all
  if (!resolved) {
    const profiles = listProfiles();
    if (profiles.length === 0) {
      console.log("No runners registered.");
      console.log("");
      console.log("Register with: deployx-runner register --token <TOKEN> --url <URL>");
      return;
    }

    console.log(`${profiles.length} runner(s) registered:\n`);
    for (const p of profiles) {
      const config = loadConfig(p);
      if (!config) continue;
      console.log(`  Profile: ${p}`);
      console.log(`    ID:            ${config.runner_id}`);
      console.log(`    Name:          ${config.name}`);
      console.log(`    Control Plane: ${config.control_plane_url}`);
      console.log(`    Config:        ${getConfigPath(p)}`);
      console.log("");
    }
    console.log("Use --profile <name> for detailed status with connectivity check.");
    return;
  }

  const config = loadConfig(resolved);
  if (!config) {
    console.log(`Runner profile "${resolved}" is not registered.`);
    console.log("");
    console.log("Register with: deployx-runner register --token <TOKEN> --url <URL>");
    return;
  }

  console.log("Runner Configuration:");
  console.log(`  Profile:        ${resolved}`);
  console.log(`  ID:             ${config.runner_id}`);
  console.log(`  Name:           ${config.name}`);
  console.log(`  Control Plane:  ${config.control_plane_url}`);
  console.log(`  Config:         ${getConfigPath(resolved)}`);
  console.log("");

  // Test connectivity
  console.log("Testing connectivity...");
  const client = new RunnerApiClient(config);
  try {
    await client.heartbeat();
    console.log("  Connection: OK");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.log(`  Connection: FAILED — ${msg}`);
  }
}
