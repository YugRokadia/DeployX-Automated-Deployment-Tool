import { describe, it, expect } from "vitest";
import {
  createWindow,
  pushEntry,
  computeHealth,
  getPassRate,
} from "../sliding-window";

describe("createWindow", () => {
  it("creates empty window with given size", () => {
    const w = createWindow(10);

    expect(w.entries).toEqual([]);
    expect(w.windowSize).toBe(10);
  });
});

describe("pushEntry", () => {
  it("adds an entry to an empty window", () => {
    const w = createWindow(5);
    const updated = pushEntry(w, { passed: true, timestamp: 1000 });

    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].passed).toBe(true);
  });

  it("preserves original state (immutable)", () => {
    const w = createWindow(5);
    const updated = pushEntry(w, { passed: true, timestamp: 1000 });

    expect(w.entries).toHaveLength(0);
    expect(updated.entries).toHaveLength(1);
  });

  it("accumulates entries up to windowSize", () => {
    let w = createWindow(3);
    w = pushEntry(w, { passed: true, timestamp: 1 });
    w = pushEntry(w, { passed: false, timestamp: 2 });
    w = pushEntry(w, { passed: true, timestamp: 3 });

    expect(w.entries).toHaveLength(3);
  });

  it("trims oldest entries when exceeding windowSize", () => {
    let w = createWindow(3);
    w = pushEntry(w, { passed: true, timestamp: 1 });
    w = pushEntry(w, { passed: false, timestamp: 2 });
    w = pushEntry(w, { passed: true, timestamp: 3 });
    w = pushEntry(w, { passed: false, timestamp: 4 });

    expect(w.entries).toHaveLength(3);
    // Oldest (timestamp: 1) should be gone
    expect(w.entries[0].timestamp).toBe(2);
    expect(w.entries[2].timestamp).toBe(4);
  });

  it("windowSize of 1 keeps only latest entry", () => {
    let w = createWindow(1);
    w = pushEntry(w, { passed: true, timestamp: 1 });
    w = pushEntry(w, { passed: false, timestamp: 2 });

    expect(w.entries).toHaveLength(1);
    expect(w.entries[0].passed).toBe(false);
  });
});

describe("computeHealth", () => {
  it("returns 'healthy' for empty window (no data)", () => {
    const w = createWindow(10);
    const health = computeHealth(w, 0.8, 0.5);

    expect(health).toBe("healthy");
  });

  it("returns 'healthy' when all checks pass", () => {
    let w = createWindow(5);
    for (let i = 0; i < 5; i++) {
      w = pushEntry(w, { passed: true, timestamp: i });
    }
    const health = computeHealth(w, 0.8, 0.5);

    expect(health).toBe("healthy");
  });

  it("returns 'healthy' when pass rate meets threshold (0.8)", () => {
    let w = createWindow(10);
    // 8 pass, 2 fail → 80% pass rate → exactly at threshold
    for (let i = 0; i < 8; i++) {
      w = pushEntry(w, { passed: true, timestamp: i });
    }
    for (let i = 0; i < 2; i++) {
      w = pushEntry(w, { passed: false, timestamp: 10 + i });
    }
    const health = computeHealth(w, 0.8, 0.5);

    expect(health).toBe("healthy");
  });

  it("returns 'degraded' when pass rate is between thresholds", () => {
    let w = createWindow(10);
    // 7 pass, 3 fail → 70% pass rate → between 0.5 and 0.8
    for (let i = 0; i < 7; i++) {
      w = pushEntry(w, { passed: true, timestamp: i });
    }
    for (let i = 0; i < 3; i++) {
      w = pushEntry(w, { passed: false, timestamp: 10 + i });
    }
    const health = computeHealth(w, 0.8, 0.5);

    expect(health).toBe("degraded");
  });

  it("returns 'degraded' at exactly degraded threshold (0.5)", () => {
    let w = createWindow(10);
    // 5 pass, 5 fail → 50% pass rate → exactly at degraded threshold
    for (let i = 0; i < 5; i++) {
      w = pushEntry(w, { passed: true, timestamp: i });
    }
    for (let i = 0; i < 5; i++) {
      w = pushEntry(w, { passed: false, timestamp: 10 + i });
    }
    const health = computeHealth(w, 0.8, 0.5);

    expect(health).toBe("degraded");
  });

  it("returns 'unhealthy' when pass rate is below degraded threshold", () => {
    let w = createWindow(10);
    // 4 pass, 6 fail → 40% pass rate → below 0.5
    for (let i = 0; i < 4; i++) {
      w = pushEntry(w, { passed: true, timestamp: i });
    }
    for (let i = 0; i < 6; i++) {
      w = pushEntry(w, { passed: false, timestamp: 10 + i });
    }
    const health = computeHealth(w, 0.8, 0.5);

    expect(health).toBe("unhealthy");
  });

  it("returns 'unhealthy' when all checks fail", () => {
    let w = createWindow(5);
    for (let i = 0; i < 5; i++) {
      w = pushEntry(w, { passed: false, timestamp: i });
    }
    const health = computeHealth(w, 0.8, 0.5);

    expect(health).toBe("unhealthy");
  });

  it("works with partial window (fewer entries than windowSize)", () => {
    let w = createWindow(10);
    // Only 2 entries, 1 pass → 50% → degraded
    w = pushEntry(w, { passed: true, timestamp: 1 });
    w = pushEntry(w, { passed: false, timestamp: 2 });
    const health = computeHealth(w, 0.8, 0.5);

    expect(health).toBe("degraded");
  });
});

describe("getPassRate", () => {
  it("returns 1 for empty window", () => {
    const w = createWindow(10);

    expect(getPassRate(w)).toBe(1);
  });

  it("returns 1 when all pass", () => {
    let w = createWindow(5);
    for (let i = 0; i < 5; i++) {
      w = pushEntry(w, { passed: true, timestamp: i });
    }

    expect(getPassRate(w)).toBe(1);
  });

  it("returns 0 when all fail", () => {
    let w = createWindow(5);
    for (let i = 0; i < 5; i++) {
      w = pushEntry(w, { passed: false, timestamp: i });
    }

    expect(getPassRate(w)).toBe(0);
  });

  it("returns correct ratio for mixed results", () => {
    let w = createWindow(10);
    // 7 pass, 3 fail
    for (let i = 0; i < 7; i++) {
      w = pushEntry(w, { passed: true, timestamp: i });
    }
    for (let i = 0; i < 3; i++) {
      w = pushEntry(w, { passed: false, timestamp: 10 + i });
    }

    expect(getPassRate(w)).toBeCloseTo(0.7);
  });
});
