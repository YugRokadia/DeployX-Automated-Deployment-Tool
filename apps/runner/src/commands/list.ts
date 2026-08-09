import { loadConfig, getConfigPath, listProfiles } from "../config";

export async function listCommand(): Promise<void> {
  const profiles = listProfiles();

  if (profiles.length === 0) {
    console.log("No runners registered.");
    console.log("");
    console.log("Register with: deployx-runner register --token <TOKEN> --url <URL> --name <NAME>");
    return;
  }

  console.log(`${profiles.length} runner(s) registered:\n`);

  for (const profile of profiles) {
    const config = loadConfig(profile);
    if (!config) {
      console.log(`  ${profile}  (config invalid)`);
      continue;
    }
    console.log(`  ${profile}`);
    console.log(`    Name:          ${config.name}`);
    console.log(`    ID:            ${config.runner_id}`);
    console.log(`    Control Plane: ${config.control_plane_url}`);
    console.log(`    Config:        ${getConfigPath(profile)}`);
    console.log("");
  }

  console.log("Commands:");
  console.log("  deployx-runner start --profile <name>       Start a runner");
  console.log("  deployx-runner status --profile <name>      Check connectivity");
  console.log("  deployx-runner unregister --profile <name>  Remove a runner");
}
