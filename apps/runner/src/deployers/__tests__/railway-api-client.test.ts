import { describe, it, expect, vi, beforeEach } from "vitest";
import { RailwayApiClient } from "../clients/railway-api-client";

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

function createClient(baseUrl?: string) {
  return new RailwayApiClient({
    apiToken: "test-token",
    ...(baseUrl ? { baseUrl } : {}),
  });
}

describe("RailwayApiClient", () => {
  it("getProject makes GET request with auth header", async () => {
    const project = { id: "proj-1", name: "my-project" };
    mockResponse(project);

    const result = await createClient().getProject("proj-1");

    expect(result).toEqual(project);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.railway.com/v2/projects/proj-1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("listServices returns services array", async () => {
    const services = [
      { id: "svc-1", projectId: "proj-1", name: "web" },
      { id: "svc-2", projectId: "proj-1", name: "api" },
    ];
    mockResponse({ services });

    const result = await createClient().listServices("proj-1");

    expect(result).toEqual(services);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.railway.com/v2/projects/proj-1/services",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("createService sends correct POST body", async () => {
    const service = { id: "svc-3", projectId: "proj-1", name: "worker" };
    mockResponse(service);

    const result = await createClient().createService("proj-1", "worker");

    expect(result).toEqual(service);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.railway.com/v2/projects/proj-1/services",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "worker" }),
      }),
    );
  });

  it("createDeployment sends image and env", async () => {
    const deployment = { id: "dep-1", status: "building", serviceId: "svc-1" };
    const env = { NODE_ENV: "production", PORT: "3000" };
    mockResponse(deployment);

    const result = await createClient().createDeployment("svc-1", "app:latest", env);

    expect(result).toEqual(deployment);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.railway.com/v2/services/svc-1/deployments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ image: "app:latest", env }),
      }),
    );
  });

  it("getDeployment returns deployment object", async () => {
    const deployment = {
      id: "dep-2",
      status: "success",
      serviceId: "svc-1",
      staticUrl: "https://app.up.railway.app",
    };
    mockResponse(deployment);

    const result = await createClient().getDeployment("dep-2");

    expect(result).toEqual(deployment);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.railway.com/v2/deployments/dep-2",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("cancelDeployment sends DELETE", async () => {
    mockResponse(undefined, 204);

    await createClient().cancelDeployment("dep-3");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.railway.com/v2/deployments/dep-3",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("getDeploymentLogs returns logs array", async () => {
    const logs = [
      { timestamp: "2025-01-01T00:00:00Z", message: "Starting..." },
      { timestamp: "2025-01-01T00:00:01Z", message: "Ready" },
    ];
    mockResponse({ logs });

    const result = await createClient().getDeploymentLogs("dep-1");

    expect(result).toEqual(logs);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.railway.com/v2/deployments/dep-1/logs?limit=100",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws on non-200 response with status code and body", async () => {
    mockResponse({ error: "Not Found" }, 404);

    await expect(createClient().getProject("bad-id")).rejects.toThrow(
      /Railway API GET \/projects\/bad-id failed \(404\)/,
    );
  });

  it("uses custom baseUrl", async () => {
    const project = { id: "proj-1", name: "custom" };
    mockResponse(project);

    await createClient("https://custom.railway.io/api").getProject("proj-1");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://custom.railway.io/api/projects/proj-1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("strips trailing slash from custom baseUrl", async () => {
    const project = { id: "proj-1", name: "slashed" };
    mockResponse(project);

    await createClient("https://custom.railway.io/api/").getProject("proj-1");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://custom.railway.io/api/projects/proj-1",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
