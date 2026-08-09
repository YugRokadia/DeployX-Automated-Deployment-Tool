import { execa } from "execa";

// ── Types ───────────────────────────────────────────────────────

export interface PortMapping {
  readonly host: number;
  readonly container: number;
}

export interface RunContainerOptions {
  readonly name: string;
  readonly image: string;
  readonly network: string;
  readonly ports?: readonly PortMapping[];
  readonly env?: Readonly<Record<string, string>>;
  readonly labels?: Readonly<Record<string, string>>;
  readonly detach: boolean;
  readonly restart?: "no" | "always" | "unless-stopped";
}

export interface ContainerInspection {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  readonly image: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface ContainerInfo {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly image: string;
}

// ── Network Management ──────────────────────────────────────────

export async function ensureNetwork(name: string): Promise<void> {
  try {
    await execa("docker", ["network", "inspect", name], { reject: false });
    // Network exists — check exit code
    const result = await execa("docker", ["network", "inspect", name], {
      reject: false,
    });
    if (result.exitCode === 0) return;
  } catch {
    // Ignore — will create below
  }

  await execa("docker", ["network", "create", name]);
}

// ── Container Lifecycle ─────────────────────────────────────────

export async function runContainer(
  options: RunContainerOptions,
): Promise<string> {
  const args = ["run"];

  if (options.detach) args.push("-d");

  args.push("--name", options.name);
  args.push("--network", options.network);

  if (options.restart) {
    args.push("--restart", options.restart);
  }

  if (options.ports) {
    for (const pm of options.ports) {
      args.push("-p", `${pm.host}:${pm.container}`);
    }
  }

  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      args.push("-e", `${key}=${value}`);
    }
  }

  if (options.labels) {
    for (const [key, value] of Object.entries(options.labels)) {
      args.push("--label", `${key}=${value}`);
    }
  }

  args.push(options.image);

  const result = await execa("docker", args);
  return result.stdout.trim();
}

export async function stopContainer(
  name: string,
  timeoutSeconds = 10,
): Promise<void> {
  const result = await execa(
    "docker",
    ["stop", "-t", String(timeoutSeconds), name],
    { reject: false },
  );

  if (result.exitCode !== 0 && !result.stderr.includes("No such container")) {
    throw new Error(`Failed to stop container ${name}: ${result.stderr}`);
  }
}

export async function removeContainer(name: string): Promise<void> {
  const result = await execa("docker", ["rm", "-f", name], { reject: false });

  if (result.exitCode !== 0 && !result.stderr.includes("No such container")) {
    throw new Error(`Failed to remove container ${name}: ${result.stderr}`);
  }
}

export async function restartContainer(
  name: string,
  timeoutSeconds = 10,
): Promise<void> {
  const result = await execa(
    "docker",
    ["restart", "-t", String(timeoutSeconds), name],
    { reject: false },
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to restart container ${name}: ${result.stderr}`);
  }
}

// ── Container Inspection ────────────────────────────────────────

export async function inspectContainer(
  name: string,
): Promise<ContainerInspection | null> {
  const result = await execa(
    "docker",
    ["inspect", "--format", "json", name],
    { reject: false },
  );

  if (result.exitCode !== 0) return null;

  try {
    const data = JSON.parse(result.stdout);
    const container = Array.isArray(data) ? data[0] : data;
    return {
      id: container.Id ?? "",
      name: (container.Name ?? "").replace(/^\//, ""),
      state: container.State?.Status ?? "unknown",
      image: container.Config?.Image ?? "",
      labels: container.Config?.Labels ?? {},
    };
  } catch {
    return null;
  }
}

export async function isContainerRunning(name: string): Promise<boolean> {
  const inspection = await inspectContainer(name);
  return inspection?.state === "running";
}

export async function getContainerLogs(
  name: string,
  tail = 100,
): Promise<readonly string[]> {
  const result = await execa(
    "docker",
    ["logs", "--tail", String(tail), name],
    { reject: false },
  );

  if (result.exitCode !== 0) return [];

  const combined = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n");

  return combined.split("\n").filter(Boolean);
}

// ── Container Discovery ─────────────────────────────────────────

export async function listContainersByLabel(
  label: string,
): Promise<readonly ContainerInfo[]> {
  const result = await execa(
    "docker",
    [
      "ps",
      "-a",
      "--filter",
      `label=${label}`,
      "--format",
      "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}",
    ],
    { reject: false },
  );

  if (result.exitCode !== 0 || !result.stdout.trim()) return [];

  return result.stdout
    .trim()
    .split("\n")
    .map((line) => {
      const [id, name, status, image] = line.split("\t");
      return { id, name, status, image };
    });
}

// ── Cleanup Helpers ─────────────────────────────────────────────

export async function removeContainerIfExists(name: string): Promise<void> {
  const exists = await inspectContainer(name);
  if (exists) {
    await stopContainer(name, 5);
    await removeContainer(name);
  }
}
