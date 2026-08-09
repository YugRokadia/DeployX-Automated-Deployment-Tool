// Simple test suite — no external dependencies required.
// Validates that the demo app satisfies DeployX contracts.

const http = require("http");

const PORT = 4999; // Use a non-standard port to avoid conflicts
let serverRef;

async function fetch(path) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://localhost:${PORT}${path}`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: JSON.parse(body) })
        );
      })
      .on("error", reject);
  });
}

async function runTests() {
  // Start server on test port
  process.env.PORT = String(PORT);
  const { server } = require("./server");
  serverRef = server;

  let passed = 0;
  let failed = 0;

  function assert(name, condition) {
    if (condition) {
      console.log(`  PASS: ${name}`);
      passed++;
    } else {
      console.error(`  FAIL: ${name}`);
      failed++;
    }
  }

  console.log("\nDeployX Contract Tests\n");

  // Test 1: Health endpoint returns 200
  const health = await fetch("/health");
  assert("GET /health returns 200", health.status === 200);
  assert(
    'GET /health returns { status: "healthy" }',
    health.body.status === "healthy"
  );

  // Test 2: Root endpoint returns app info
  const root = await fetch("/");
  assert("GET / returns 200", root.status === 200);
  assert("GET / has app name", root.body.name === "deployx-demo-app");
  assert("GET / has version", typeof root.body.version === "string" && /^\d+\.\d+\.\d+$/.test(root.body.version));
  assert("GET / has uptime", typeof root.body.uptime_seconds === "number");

  // Test 3: API endpoint works
  const items = await fetch("/api/items");
  assert("GET /api/items returns 200", items.status === 200);
  assert("GET /api/items has data array", Array.isArray(items.body.data));
  assert("GET /api/items has total count", typeof items.body.total === "number");

  // Test 4: Single item endpoint
  const item = await fetch("/api/items/1");
  assert("GET /api/items/1 returns 200", item.status === 200);
  assert("GET /api/items/1 has data", item.body.data.id === "1");

  // Test 5: 404 for missing item
  const missing = await fetch("/api/items/999");
  assert("GET /api/items/999 returns 404", missing.status === 404);

  // Summary
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  server.close();

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  if (serverRef) serverRef.close();
  process.exit(1);
});
