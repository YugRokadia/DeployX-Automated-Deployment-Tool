import { describe, it, expect } from "vitest";
import { resolveDAG, validateDAG } from "../dag";

describe("resolveDAG", () => {
  it("handles a single task with no deps", () => {
    const result = resolveDAG({ build: {} });
    expect(result.groups).toEqual([["build"]]);
    expect(result.order).toEqual(["build"]);
  });

  it("handles a linear chain", () => {
    const result = resolveDAG({
      checkout: {},
      build: { depends_on: ["checkout"] },
      deploy: { depends_on: ["build"] },
    });
    expect(result.groups).toEqual([["checkout"], ["build"], ["deploy"]]);
    expect(result.order).toEqual(["checkout", "build", "deploy"]);
  });

  it("groups independent tasks in parallel", () => {
    const result = resolveDAG({
      lint: {},
      test: {},
      typecheck: {},
    });
    // All three should be in one group (sorted alphabetically)
    expect(result.groups).toEqual([["lint", "test", "typecheck"]]);
  });

  it("resolves diamond dependency correctly", () => {
    const result = resolveDAG({
      build: {},
      lint: {},
      test: { depends_on: ["build"] },
      deploy: { depends_on: ["test", "lint"] },
    });
    // Group 1: build, lint (both no deps)
    // Group 2: test (depends on build)
    // Group 3: deploy (depends on test + lint)
    expect(result.groups).toEqual([
      ["build", "lint"],
      ["test"],
      ["deploy"],
    ]);
  });

  it("resolves complex DAG with fan-out and fan-in", () => {
    const result = resolveDAG({
      checkout: {},
      lint: { depends_on: ["checkout"] },
      test: { depends_on: ["checkout"] },
      security: { depends_on: ["checkout"] },
      build: { depends_on: ["lint", "test", "security"] },
      deploy: { depends_on: ["build"] },
    });
    expect(result.groups).toEqual([
      ["checkout"],
      ["lint", "security", "test"],
      ["build"],
      ["deploy"],
    ]);
  });

  it("handles empty tasks", () => {
    const result = resolveDAG({});
    expect(result.groups).toEqual([]);
    expect(result.order).toEqual([]);
  });

  it("throws on cycle (A→B→A)", () => {
    expect(() =>
      resolveDAG({
        a: { depends_on: ["b"] },
        b: { depends_on: ["a"] },
      }),
    ).toThrow("Cycle detected");
  });

  it("throws on self-referencing task", () => {
    expect(() =>
      resolveDAG({
        a: { depends_on: ["a"] },
      }),
    ).toThrow("depends on itself");
  });

  it("throws on missing dependency", () => {
    expect(() =>
      resolveDAG({
        build: { depends_on: ["checkout"] },
      }),
    ).toThrow('does not exist');
  });

  it("throws on three-node cycle", () => {
    expect(() =>
      resolveDAG({
        a: { depends_on: ["c"] },
        b: { depends_on: ["a"] },
        c: { depends_on: ["b"] },
      }),
    ).toThrow("Cycle detected");
  });
});

describe("validateDAG", () => {
  it("returns empty array for valid DAG", () => {
    const errors = validateDAG({
      build: {},
      test: { depends_on: ["build"] },
    });
    expect(errors).toEqual([]);
  });

  it("returns errors for missing dependencies", () => {
    const errors = validateDAG({
      build: { depends_on: ["missing"] },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("missing");
    expect(errors[0]).toContain("does not exist");
  });

  it("returns errors for self-referencing tasks", () => {
    const errors = validateDAG({
      build: { depends_on: ["build"] },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("depends on itself");
  });

  it("returns cycle error", () => {
    const errors = validateDAG({
      a: { depends_on: ["b"] },
      b: { depends_on: ["a"] },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Cycle detected");
  });
});
