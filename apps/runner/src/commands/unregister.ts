import { loadConfig, deleteConfig, getConfigPath, listProfiles, resolveProfile } from "../config";

interface UnregisterOptions {
  readonly profile?: string;
}

export async function unregisterCommand(options: UnregisterOptions): Promise<void> {
  const resolved = resolveProfile(options.profile);

  if (!resolved) {
    const profiles = listProfiles();
    if (profiles.length === 0) {
      console.log("No runners registered. Nothing to do.");
      return;
    }
    console.error("Multiple runners registered. Specify which one to unregister:");
    for (const p of profiles) {
      console.error(`  deployx-runner unregister --profile ${p}`);
    }
    process.exit(1);
    return;
  }

  const config = loadConfig(resolved);
  if (!config) {
    console.log(`Runner profile "${resolved}" is not registered. Nothing to do.`);
    return;
  }

  console.log(`Unregistering runner "${config.name}" (${config.runner_id})...`);

  deleteConfig(resolved);

  console.log(`Config removed: ${getConfigPath(resolved)}`);
  console.log("Runner unregistered successfully.");
  console.log("");
  console.log("Note: The runner record still exists on the control plane.");
  console.log("It will show as 'offline' after the heartbeat timeout.");
}
