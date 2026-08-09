const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

app.use(express.json());

// Root — app info
app.get("/", (_req, res) => {
  res.json({
    name: "deployx-demo-app",
    version: "2.0.0",
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    environment: process.env.NODE_ENV || "development",
  });
});


app.get("/health", (_req, res) => {
  res.json({ status: "healthy" });
});


const items = [
  { id: "1", name: "Widget A", price: 9.99 },
  { id: "2", name: "Widget B", price: 19.99 },
  { id: "3", name: "Gadget C", price: 29.99 },
];

app.get("/api/items", (_req, res) => {
  res.json({ data: items, total: items.length });
});

app.get("/api/items/:id", (req, res) => {
  const item = items.find((i) => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }
  res.json({ data: item });
});

// Start 
const server = app.listen(PORT, () => {
  console.log(`Demo app listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown — required for blue-green/rolling deploys.

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

module.exports = { app, server };
