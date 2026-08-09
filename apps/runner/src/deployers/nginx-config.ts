import { execa } from "execa";

// ── Types ───────────────────────────────────────────────────────

export interface NginxUpstream {
  readonly name: string;
  readonly port: number;
}

export interface WeightedUpstreamServer {
  readonly name: string;
  readonly port: number;
  readonly weight?: number;
}

// ── Config Generation ───────────────────────────────────────────

export function generateNginxConfig(options: {
  readonly listenPort: number;
  readonly upstream: NginxUpstream;
  readonly healthCheckPath: string;
}): string {
  const { listenPort, upstream, healthCheckPath } = options;

  return `
upstream app {
    server ${upstream.name}:${upstream.port};
}

server {
    listen ${listenPort};

    location / {
        proxy_pass http://app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }

    location ${healthCheckPath} {
        proxy_pass http://app${healthCheckPath};
        proxy_connect_timeout 3s;
        proxy_read_timeout 5s;
    }
}
`.trimStart();
}

// ── Weighted Config Generation ──────────────────────────────────

export function generateWeightedNginxConfig(options: {
  readonly listenPort: number;
  readonly upstreams: readonly WeightedUpstreamServer[];
  readonly healthCheckPath: string;
}): string {
  const { listenPort, upstreams, healthCheckPath } = options;

  const serverLines = upstreams
    .map((u) => {
      const weightPart = u.weight != null && u.weight !== 1 ? ` weight=${u.weight}` : "";
      return `    server ${u.name}:${u.port}${weightPart};`;
    })
    .join("\n");

  return `upstream app {
${serverLines}
}

server {
    listen ${listenPort};

    location / {
        proxy_pass http://app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }

    location ${healthCheckPath} {
        proxy_pass http://app${healthCheckPath};
        proxy_connect_timeout 3s;
        proxy_read_timeout 5s;
    }
}
`;
}

// ── Canary Weight Calculator ────────────────────────────────────

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function calculateCanaryWeights(canaryPercent: number): {
  readonly stableWeight: number;
  readonly canaryWeight: number;
} {
  if (canaryPercent <= 0) return { stableWeight: 1, canaryWeight: 0 };
  if (canaryPercent >= 100) return { stableWeight: 0, canaryWeight: 1 };

  const stablePercent = 100 - canaryPercent;
  const divisor = gcd(stablePercent, canaryPercent);

  return {
    stableWeight: stablePercent / divisor,
    canaryWeight: canaryPercent / divisor,
  };
}

// ── Config Deployment ───────────────────────────────────────────

export async function writeNginxConfig(
  proxyContainerName: string,
  config: string,
): Promise<void> {
  // Write config via docker exec + sh -c with heredoc
  const result = await execa(
    "docker",
    [
      "exec",
      proxyContainerName,
      "sh",
      "-c",
      `cat > /etc/nginx/conf.d/default.conf << 'NGINX_EOF'\n${config}NGINX_EOF`,
    ],
    { reject: false },
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to write nginx config to ${proxyContainerName}: ${result.stderr}`,
    );
  }
}

export async function reloadNginx(
  proxyContainerName: string,
): Promise<void> {
  // Test config first
  const testResult = await execa(
    "docker",
    ["exec", proxyContainerName, "nginx", "-t"],
    { reject: false },
  );

  if (testResult.exitCode !== 0) {
    throw new Error(
      `Nginx config test failed in ${proxyContainerName}: ${testResult.stderr}`,
    );
  }

  // Reload
  const reloadResult = await execa(
    "docker",
    ["exec", proxyContainerName, "nginx", "-s", "reload"],
    { reject: false },
  );

  if (reloadResult.exitCode !== 0) {
    throw new Error(
      `Nginx reload failed in ${proxyContainerName}: ${reloadResult.stderr}`,
    );
  }
}
