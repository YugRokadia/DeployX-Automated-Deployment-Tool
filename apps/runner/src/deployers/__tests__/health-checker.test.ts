import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkHealth, waitForHealthy } from "../health-checker";

describe("checkHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns passed=true for HTTP 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("OK", { status: 200 }),
    );

    const result = await checkHealth("http://localhost:3000/health", 5000);

    expect(result.passed).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeUndefined();
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns passed=true for HTTP 301 redirect", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 301 }),
    );

    const result = await checkHealth("http://localhost:3000/health", 5000);

    expect(result.passed).toBe(true);
    expect(result.statusCode).toBe(301);
  });

  it("returns passed=false for HTTP 500", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    const result = await checkHealth("http://localhost:3000/health", 5000);

    expect(result.passed).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.error).toBe("HTTP 500");
  });

  it("returns passed=false for HTTP 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );

    const result = await checkHealth("http://localhost:3000/health", 5000);

    expect(result.passed).toBe(false);
    expect(result.statusCode).toBe(404);
    expect(result.error).toBe("HTTP 404");
  });

  it("returns passed=false on network error with null statusCode", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("ECONNREFUSED"),
    );

    const result = await checkHealth("http://localhost:3000/health", 5000);

    expect(result.passed).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.error).toBe("ECONNREFUSED");
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns passed=false on abort/timeout error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("The operation was aborted"),
    );

    const result = await checkHealth("http://localhost:3000/health", 100);

    expect(result.passed).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.error).toContain("aborted");
  });
});

describe("waitForHealthy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately on first successful check", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("OK", { status: 200 }),
    );

    const promise = waitForHealthy({
      url: "http://localhost:3000/health",
      timeoutMs: 5000,
      retries: 3,
      intervalMs: 1000,
    });

    // Flush microtasks
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;

    expect(result.passed).toBe(true);
    expect(result.statusCode).toBe(200);
    // fetch should be called only once
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on later attempt", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(new Response("OK", { status: 200 }));

    const promise = waitForHealthy({
      url: "http://localhost:3000/health",
      timeoutMs: 5000,
      retries: 5,
      intervalMs: 1000,
    });

    // First attempt fails, then wait 1000ms
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    // Second attempt fails, then wait 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // Third attempt succeeds

    const result = await promise;

    expect(result.passed).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("returns failure after exhausting all retries", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("ECONNREFUSED"),
    );

    const promise = waitForHealthy({
      url: "http://localhost:3000/health",
      timeoutMs: 5000,
      retries: 3,
      intervalMs: 500,
    });

    // Advance through all retries (3 attempts, 2 intervals between them)
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;

    expect(result.passed).toBe(false);
    expect(result.error).toContain("Failed after 3 attempts");
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("waits for start period before first check", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("OK", { status: 200 }),
    );

    const promise = waitForHealthy({
      url: "http://localhost:3000/health",
      timeoutMs: 5000,
      retries: 3,
      intervalMs: 1000,
      startPeriodMs: 2000,
    });

    // Before start period, fetch should not have been called
    await vi.advanceTimersByTimeAsync(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    // Advance past start period
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;

    expect(result.passed).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
