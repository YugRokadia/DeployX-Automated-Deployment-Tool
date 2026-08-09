import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:fs before importing the module under test
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock node:os to control homedir
vi.mock("node:os", () => ({
  homedir: vi.fn().mockReturnValue("/home/testuser"),
}));

// Mock the shared constants
vi.mock("@deployx/shared", () => ({
  DEPLOYER_PORT_RANGE_START: 10000,
  DEPLOYER_PORT_RANGE_END: 10999,
}));

import {
  allocatePort,
  releasePort,
  getPortForProject,
  loadPortAllocations,
} from "../port-allocator";

describe("port-allocator", () => {
  let mockReadFileSync: ReturnType<typeof vi.fn>;
  let mockWriteFileSync: ReturnType<typeof vi.fn>;
  let mockMkdirSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const fsMod = await import("node:fs");
    mockReadFileSync = fsMod.readFileSync as unknown as ReturnType<typeof vi.fn>;
    mockWriteFileSync = fsMod.writeFileSync as unknown as ReturnType<typeof vi.fn>;
    mockMkdirSync = fsMod.mkdirSync as unknown as ReturnType<typeof vi.fn>;

    // Default: empty ports file (file not found)
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
  });

  describe("allocatePort", () => {
    it("returns existing allocation for the same slug", () => {
      const existingData = {
        allocations: [{ projectSlug: "my-app", proxyPort: 10000 }],
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const result = allocatePort("my-app");

      expect(result).toEqual({ projectSlug: "my-app", proxyPort: 10000 });
      // Should not write since it already exists
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it("assigns next available port for a new slug", () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const result = allocatePort("new-app");

      expect(result).toEqual({ projectSlug: "new-app", proxyPort: 10000 });
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      expect(mockMkdirSync).toHaveBeenCalledWith(
        "/home/testuser/.deployx",
        { recursive: true },
      );
    });

    it("assigns port after existing allocations", () => {
      const existingData = {
        allocations: [
          { projectSlug: "app-a", proxyPort: 10000 },
          { projectSlug: "app-b", proxyPort: 10001 },
        ],
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const result = allocatePort("app-c");

      expect(result).toEqual({ projectSlug: "app-c", proxyPort: 10002 });
    });

    it("fills gaps in port range", () => {
      const existingData = {
        allocations: [
          { projectSlug: "app-a", proxyPort: 10000 },
          { projectSlug: "app-c", proxyPort: 10002 },
        ],
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const result = allocatePort("app-b");

      expect(result).toEqual({ projectSlug: "app-b", proxyPort: 10001 });
    });

    it("writes updated allocations to disk", () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      allocatePort("my-app");

      const writtenData = JSON.parse(
        mockWriteFileSync.mock.calls[0][1] as string,
      );
      expect(writtenData.allocations).toEqual([
        { projectSlug: "my-app", proxyPort: 10000 },
      ]);
    });
  });

  describe("releasePort", () => {
    it("removes the allocation for the given slug", () => {
      const existingData = {
        allocations: [
          { projectSlug: "app-a", proxyPort: 10000 },
          { projectSlug: "app-b", proxyPort: 10001 },
        ],
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      releasePort("app-a");

      const writtenData = JSON.parse(
        mockWriteFileSync.mock.calls[0][1] as string,
      );
      expect(writtenData.allocations).toEqual([
        { projectSlug: "app-b", proxyPort: 10001 },
      ]);
    });

    it("writes unchanged data when slug does not exist", () => {
      const existingData = {
        allocations: [{ projectSlug: "app-a", proxyPort: 10000 }],
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      releasePort("nonexistent");

      const writtenData = JSON.parse(
        mockWriteFileSync.mock.calls[0][1] as string,
      );
      expect(writtenData.allocations).toEqual([
        { projectSlug: "app-a", proxyPort: 10000 },
      ]);
    });
  });

  describe("getPortForProject", () => {
    it("returns the allocation for the given slug", () => {
      const existingData = {
        allocations: [
          { projectSlug: "app-a", proxyPort: 10000 },
          { projectSlug: "app-b", proxyPort: 10001 },
        ],
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const result = getPortForProject("app-b");

      expect(result).toEqual({ projectSlug: "app-b", proxyPort: 10001 });
    });

    it("returns null for unknown slug", () => {
      const existingData = {
        allocations: [{ projectSlug: "app-a", proxyPort: 10000 }],
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const result = getPortForProject("nonexistent");

      expect(result).toBeNull();
    });

    it("returns null when ports file does not exist", () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const result = getPortForProject("any-app");

      expect(result).toBeNull();
    });
  });

  describe("loadPortAllocations", () => {
    it("returns all allocations from the ports file", () => {
      const existingData = {
        allocations: [
          { projectSlug: "app-a", proxyPort: 10000 },
          { projectSlug: "app-b", proxyPort: 10001 },
        ],
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const result = loadPortAllocations();

      expect(result).toEqual([
        { projectSlug: "app-a", proxyPort: 10000 },
        { projectSlug: "app-b", proxyPort: 10001 },
      ]);
    });

    it("returns empty array when no file exists", () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const result = loadPortAllocations();

      expect(result).toEqual([]);
    });
  });
});
