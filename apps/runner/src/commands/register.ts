import * as os from "node:os";
import { loadConfig, saveConfig, getConfigPath, listProfiles } from "../config";
import { RunnerApiClient } from "../api-client";

interface RegisterOptions {
  readonly token: string;
  readonly url: string;
  readonly name: string;
  readonly profile?: string;
}

export async function registerCommand(options: RegisterOptions): Promise<void> {
  const profile = options.profile ?? options.name;

  const existing = loadConfig(profile);
  if (existing) {
    console.error(
      `Runner profile "${profile}" already registered as "${existing.name}" (${existing.runner_id}).`,
    );
    console.error(`Config: ${getConfigPath(profile)}`);
    console.error("Run 'deployx-runner unregister --profile %s' first to re-register.", profile);
    process.exit(1);
  }

  const systemInfo = {
    os: os.platform(),
    arch: os.arch(),
    version: process.version,
  };

  console.log(`Registering runner "${options.name}" with ${options.url}...`);

  // Create a temporary client just for registration
  const tempClient = new RunnerApiClient({
    runner_id: "",
    token: options.token,
    control_plane_url: options.url,
    name: options.name,
  });

  try {
    const result = await tempClient.register(
      options.token,
      options.name,
      systemInfo,
    );

    saveConfig(
      {
        runner_id: result.runner_id,
        token: options.token,
        control_plane_url: options.url,
        name: options.name,
      },
      profile,
    );

    console.log("");
    console.log("Runner registered successfully!");
    console.log(`  ID:      ${result.runner_id}`);
    console.log(`  Name:    ${options.name}`);
    console.log(`  Profile: ${profile}`);
    console.log(`  URL:     ${options.url}`);
    console.log(`  Config:  ${getConfigPath(profile)}`);
    console.log("");
    console.log(`Start the runner with: deployx-runner start --profile ${profile}`);

    const profiles = listProfiles();
    if (profiles.length > 1) {
      console.log("");
      console.log(`You now have ${profiles.length} runners registered: ${profiles.join(", ")}`);
      console.log("Use 'deployx-runner list' to see all runners.");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Registration failed: ${message}`);
    process.exit(1);
  }
}
