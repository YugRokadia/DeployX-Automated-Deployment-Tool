import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  DEPLOYER_PORT_RANGE_START,
  DEPLOYER_PORT_RANGE_END,
} from "@deployx/shared";

// ── Types ───────────────────────────────────────────────────────

export interface PortAllocation {
  readonly projectSlug: string;
  readonly proxyPort: number;
}

interface PortsFile {
  readonly allocations: readonly PortAllocation[];
}

// ── File Path ───────────────────────────────────────────────────

function getPortsFilePath(): string {
  return join(homedir(), ".deployx", "ports.json");
}

// ── Read / Write ────────────────────────────────────────────────

function readPortsFile(): PortsFile {
  try {
    const raw = readFileSync(getPortsFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as PortsFile;
    return { allocations: parsed.allocations ?? [] };
  } catch {
    return { allocations: [] };
  }
}

function writePortsFile(data: PortsFile): void {
  const filePath = getPortsFilePath();
  const dir = join(homedir(), ".deployx");
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ── Public API ──────────────────────────────────────────────────

export function loadPortAllocations(): readonly PortAllocation[] {
  return readPortsFile().allocations;
}

export function getPortForProject(
  projectSlug: string,
): PortAllocation | null {
  const { allocations } = readPortsFile();
  return allocations.find((a) => a.projectSlug === projectSlug) ?? null;
}

export function allocatePort(projectSlug: string): PortAllocation {
  const data = readPortsFile();
  const existing = data.allocations.find(
    (a) => a.projectSlug === projectSlug,
  );

  if (existing) return existing;

  // Find the next available port
  const usedPorts = new Set(data.allocations.map((a) => a.proxyPort));
  let nextPort: number | null = null;

  for (
    let port = DEPLOYER_PORT_RANGE_START;
    port <= DEPLOYER_PORT_RANGE_END;
    port++
  ) {
    if (!usedPorts.has(port)) {
      nextPort = port;
      break;
    }
  }

  if (nextPort === null) {
    const portRange = `${DEPLOYER_PORT_RANGE_START}-${DEPLOYER_PORT_RANGE_END}`;
    throw new Error(
      `Port range exhausted (${portRange}). ${usedPorts.size} ports allocated. ` +
        `Release unused projects to free ports.`,
    );
  }

  const allocation: PortAllocation = {
    projectSlug,
    proxyPort: nextPort,
  };

  const updated: PortsFile = {
    allocations: [...data.allocations, allocation],
  };

  writePortsFile(updated);
  return allocation;
}

export function releasePort(projectSlug: string): void {
  const data = readPortsFile();
  const updated: PortsFile = {
    allocations: data.allocations.filter(
      (a) => a.projectSlug !== projectSlug,
    ),
  };
  writePortsFile(updated);
}
