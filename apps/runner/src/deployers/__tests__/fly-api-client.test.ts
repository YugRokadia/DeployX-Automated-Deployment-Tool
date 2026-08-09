import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlyApiClient } from "../clients/fly-api-client";
import type { FlyMachineConfig } from "../clients/fly-api-client";

// ── Fetch mock ──────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function mockResponse(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

// ── Fixtures ────────────────────────────────────────────────────

const TOKEN = "fly-test-token";
const BASE_URL = "https://api.machines.dev/v1";
const APP_NAME = "my-app";
const MACHINE_ID = "mach-123";

const sampleConfig: FlyMachineConfig = {
  image: "registry.fly.io/my-app:latest",
  env: { NODE_ENV: "production" },
  services: [
    {
      ports: [{ port: 443, handlers: ["tls", "http"] }],
      protocol: "tcp",
      internal_port: 8080,
    },
  ],
  guest: { cpu_kind: "shared", cpus: 1, memory_mb: 256 },
};

const sampleMachine = {
  id: MACHINE_ID,
  name: "my-machine",
  state: "started",
  region: "iad",
  config: sampleConfig,
};

function createClient(): FlyApiClient {
  return new FlyApiClient({ apiToken: TOKEN });
}

// ── Tests ───────────────────────────────────────────────────────

describe("FlyApiClient", () => {
  it("getApp makes GET request with auth header", async () => {
    const appData = { name: APP_NAME, organization: { slug: "personal" } };
    mockResponse(appData);

    const client = createClient();
    const result = await client.getApp(APP_NAME);

    expect(result).toEqual(appData);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apps/${APP_NAME}`);
    expect(options.method).toBe("GET");
    expect(options.headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("createMachine sends config in POST body", async () => {
    mockResponse(sampleMachine);

    const client = createClient();
    const result = await client.createMachine(APP_NAME, sampleConfig);

    expect(result).toEqual(sampleMachine);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apps/${APP_NAME}/machines`);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ config: sampleConfig });
  });

  it("getMachine returns machine object", async () => {
    mockResponse(sampleMachine);

    const client = createClient();
    const result = await client.getMachine(APP_NAME, MACHINE_ID);

    expect(result).toEqual(sampleMachine);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apps/${APP_NAME}/machines/${MACHINE_ID}`);
    expect(options.method).toBe("GET");
  });

  it("updateMachine sends POST with config", async () => {
    const updatedConfig: FlyMachineConfig = {
      ...sampleConfig,
      image: "registry.fly.io/my-app:v2",
    };
    const updatedMachine = { ...sampleMachine, config: updatedConfig };
    mockResponse(updatedMachine);

    const client = createClient();
    const result = await client.updateMachine(
      APP_NAME,
      MACHINE_ID,
      updatedConfig,
    );

    expect(result).toEqual(updatedMachine);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apps/${APP_NAME}/machines/${MACHINE_ID}`);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ config: updatedConfig });
  });

  it("stopMachine sends POST to stop endpoint", async () => {
    mockResponse(undefined, 204);

    const client = createClient();
    await client.stopMachine(APP_NAME, MACHINE_ID);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      `${BASE_URL}/apps/${APP_NAME}/machines/${MACHINE_ID}/stop`,
    );
    expect(options.method).toBe("POST");
  });

  it("destroyMachine sends DELETE", async () => {
    mockResponse(undefined, 204);

    const client = createClient();
    await client.destroyMachine(APP_NAME, MACHINE_ID);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apps/${APP_NAME}/machines/${MACHINE_ID}`);
    expect(options.method).toBe("DELETE");
  });

  it("listMachines returns array", async () => {
    const machines = [sampleMachine, { ...sampleMachine, id: "mach-456" }];
    mockResponse(machines);

    const client = createClient();
    const result = await client.listMachines(APP_NAME);

    expect(result).toEqual(machines);
    expect(result).toHaveLength(2);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apps/${APP_NAME}/machines`);
    expect(options.method).toBe("GET");
  });

  it("getMachineLogs returns logs array", async () => {
    const logs = [
      { timestamp: "2024-01-01T00:00:00Z", message: "Server started" },
      { timestamp: "2024-01-01T00:00:01Z", message: "Listening on :8080" },
    ];
    mockResponse({ logs });

    const client = createClient();
    const result = await client.getMachineLogs(APP_NAME, MACHINE_ID);

    expect(result).toEqual(logs);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      `${BASE_URL}/apps/${APP_NAME}/machines/${MACHINE_ID}/logs?limit=100`,
    );
  });

  it("throws on non-200 response with status and body text", async () => {
    const errorBody = { error: "app not found" };
    mockResponse(errorBody, 404);

    const client = createClient();

    await expect(client.getApp("nonexistent")).rejects.toThrow(
      /Fly API GET \/apps\/nonexistent failed \(404\)/,
    );
  });

  describe("waitForMachineState", () => {
    let setTimeoutSpy: any;

    beforeEach(() => {
      setTimeoutSpy = vi
        .spyOn(globalThis, "setTimeout")
        .mockImplementation((fn: any) => {
          fn();
          return 0 as any;
        });
    });

    afterEach(() => {
      setTimeoutSpy.mockRestore();
    });

    it("polls until target state is reached", async () => {
      // First poll: state is "created"
      mockResponse({ ...sampleMachine, state: "created" });
      // Second poll: state is "started"
      mockResponse({ ...sampleMachine, state: "started" });

      const client = createClient();
      const result = await client.waitForMachineState(
        APP_NAME,
        MACHINE_ID,
        "started",
      );

      expect(result.state).toBe("started");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws when machine enters terminal state", async () => {
      mockResponse({ ...sampleMachine, state: "failed" });

      const client = createClient();

      await expect(
        client.waitForMachineState(APP_NAME, MACHINE_ID, "started"),
      ).rejects.toThrow(/terminal state: failed/);
    });
  });
});
