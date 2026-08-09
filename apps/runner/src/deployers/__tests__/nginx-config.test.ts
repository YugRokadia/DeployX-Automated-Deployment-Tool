import { describe, it, expect } from "vitest";
import {
  generateNginxConfig,
  generateWeightedNginxConfig,
  calculateCanaryWeights,
} from "../nginx-config";

describe("generateNginxConfig", () => {
  it("produces config with correct upstream name and port", () => {
    const config = generateNginxConfig({
      listenPort: 80,
      upstream: { name: "my-app-blue", port: 3000 },
      healthCheckPath: "/health",
    });

    expect(config).toContain("server my-app-blue:3000;");
  });

  it("sets the correct listen port", () => {
    const config = generateNginxConfig({
      listenPort: 8080,
      upstream: { name: "app", port: 3000 },
      healthCheckPath: "/health",
    });

    expect(config).toContain("listen 8080;");
  });

  it("includes the health check location block", () => {
    const config = generateNginxConfig({
      listenPort: 80,
      upstream: { name: "app", port: 3000 },
      healthCheckPath: "/healthz",
    });

    expect(config).toContain("location /healthz {");
    expect(config).toContain("proxy_pass http://app/healthz;");
  });

  it("includes proxy headers in the main location block", () => {
    const config = generateNginxConfig({
      listenPort: 80,
      upstream: { name: "app", port: 3000 },
      healthCheckPath: "/health",
    });

    expect(config).toContain("proxy_pass http://app;");
    expect(config).toContain("proxy_set_header Host $host;");
    expect(config).toContain("proxy_set_header X-Real-IP $remote_addr;");
    expect(config).toContain("proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;");
    expect(config).toContain("proxy_set_header X-Forwarded-Proto $scheme;");
  });

  it("includes upstream block named 'app'", () => {
    const config = generateNginxConfig({
      listenPort: 80,
      upstream: { name: "container-abc", port: 4000 },
      healthCheckPath: "/health",
    });

    expect(config).toContain("upstream app {");
    expect(config).toContain("server container-abc:4000;");
  });

  it("works with different port combinations", () => {
    const config = generateNginxConfig({
      listenPort: 443,
      upstream: { name: "web-green", port: 8080 },
      healthCheckPath: "/api/health",
    });

    expect(config).toContain("listen 443;");
    expect(config).toContain("server web-green:8080;");
    expect(config).toContain("location /api/health {");
    expect(config).toContain("proxy_pass http://app/api/health;");
  });

  it("includes timeout settings", () => {
    const config = generateNginxConfig({
      listenPort: 80,
      upstream: { name: "app", port: 3000 },
      healthCheckPath: "/health",
    });

    expect(config).toContain("proxy_connect_timeout 5s;");
    expect(config).toContain("proxy_read_timeout 30s;");
    expect(config).toContain("proxy_send_timeout 30s;");
  });

  it("does not start with a leading newline", () => {
    const config = generateNginxConfig({
      listenPort: 80,
      upstream: { name: "app", port: 3000 },
      healthCheckPath: "/health",
    });

    expect(config).not.toMatch(/^\n/);
    expect(config).toMatch(/^upstream app \{/);
  });
});

describe("generateWeightedNginxConfig", () => {
  it("produces config with multiple weighted upstream servers", () => {
    const config = generateWeightedNginxConfig({
      listenPort: 80,
      upstreams: [
        { name: "deployx-app-stable", port: 3000, weight: 9 },
        { name: "deployx-app-canary", port: 3000, weight: 2 },
      ],
      healthCheckPath: "/health",
    });

    expect(config).toContain("server deployx-app-stable:3000 weight=9;");
    expect(config).toContain("server deployx-app-canary:3000 weight=2;");
  });

  it("omits weight directive when weight is 1", () => {
    const config = generateWeightedNginxConfig({
      listenPort: 80,
      upstreams: [
        { name: "inst-0", port: 3000, weight: 1 },
        { name: "inst-1", port: 3000, weight: 1 },
      ],
      healthCheckPath: "/health",
    });

    expect(config).toContain("server inst-0:3000;");
    expect(config).toContain("server inst-1:3000;");
    expect(config).not.toContain("weight=");
  });

  it("omits weight directive when weight is undefined", () => {
    const config = generateWeightedNginxConfig({
      listenPort: 80,
      upstreams: [{ name: "app", port: 3000 }],
      healthCheckPath: "/health",
    });

    expect(config).toContain("server app:3000;");
    expect(config).not.toContain("weight=");
  });

  it("includes health check location block", () => {
    const config = generateWeightedNginxConfig({
      listenPort: 80,
      upstreams: [{ name: "app", port: 3000 }],
      healthCheckPath: "/healthz",
    });

    expect(config).toContain("location /healthz {");
    expect(config).toContain("proxy_pass http://app/healthz;");
  });

  it("sets the correct listen port", () => {
    const config = generateWeightedNginxConfig({
      listenPort: 8080,
      upstreams: [{ name: "app", port: 3000 }],
      healthCheckPath: "/health",
    });

    expect(config).toContain("listen 8080;");
  });

  it("does not start with a leading newline", () => {
    const config = generateWeightedNginxConfig({
      listenPort: 80,
      upstreams: [{ name: "app", port: 3000 }],
      healthCheckPath: "/health",
    });

    expect(config).not.toMatch(/^\n/);
    expect(config).toMatch(/^upstream app \{/);
  });
});

describe("calculateCanaryWeights", () => {
  it("returns 9:1 for 10% canary", () => {
    const result = calculateCanaryWeights(10);
    expect(result).toEqual({ stableWeight: 9, canaryWeight: 1 });
  });

  it("returns 3:1 for 25% canary", () => {
    const result = calculateCanaryWeights(25);
    expect(result).toEqual({ stableWeight: 3, canaryWeight: 1 });
  });

  it("returns 1:1 for 50% canary", () => {
    const result = calculateCanaryWeights(50);
    expect(result).toEqual({ stableWeight: 1, canaryWeight: 1 });
  });

  it("returns 0:1 for 100% canary", () => {
    const result = calculateCanaryWeights(100);
    expect(result).toEqual({ stableWeight: 0, canaryWeight: 1 });
  });

  it("returns 1:0 for 0% canary", () => {
    const result = calculateCanaryWeights(0);
    expect(result).toEqual({ stableWeight: 1, canaryWeight: 0 });
  });

  it("simplifies non-trivial ratios with GCD", () => {
    // 20% -> 80:20 -> GCD(80,20)=20 -> 4:1
    const result = calculateCanaryWeights(20);
    expect(result).toEqual({ stableWeight: 4, canaryWeight: 1 });
  });
});
