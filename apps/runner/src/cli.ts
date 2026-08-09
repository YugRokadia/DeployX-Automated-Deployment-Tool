#!/usr/bin/env node
import { Command } from "commander";
import { registerCommand } from "./commands/register";
import { startCommand } from "./commands/start";
import { statusCommand } from "./commands/status";
import { unregisterCommand } from "./commands/unregister";
import { listCommand } from "./commands/list";

const program = new Command();

program
  .name("deployx-runner")
  .description("DeployX self-hosted CI/CD runner agent")
  .version("0.0.1");

program
  .command("register")
  .description("Register this runner with a DeployX control plane")
  .requiredOption("--token <token>", "Registration token from dashboard")
  .requiredOption("--url <url>", "Control plane URL (e.g., https://deployx.vercel.app)")
  .option("--name <name>", "Runner name", `runner-${Date.now()}`)
  .option("--profile <profile>", "Profile name for config file (defaults to --name)")
  .action(registerCommand);

program
  .command("start")
  .description("Start the runner and begin polling for jobs")
  .option("--profile <profile>", "Which runner profile to start")
  .action(startCommand);

program
  .command("status")
  .description("Show runner registration status and connectivity")
  .option("--profile <profile>", "Which runner profile to check")
  .action(statusCommand);

program
  .command("unregister")
  .description("Unregister this runner and remove local config")
  .option("--profile <profile>", "Which runner profile to unregister")
  .action(unregisterCommand);

program
  .command("list")
  .description("List all registered runner profiles")
  .action(listCommand);

program.parse();
