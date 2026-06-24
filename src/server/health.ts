import http from "http";

// === Audit #12: Ограничение рекурсии до maxAttempts ===
// === Audit #13: Информативный health endpoint с uptime/memory ===
// === Audit #20: Только GET /health, остальное — 404 ===
const MAX_PORT_ATTEMPTS = 10;

let healthServer: http.Server | null = null;

export function getHealthServer() {
  return healthServer;
}

export function startHealthServer(portToTry: number, attempt = 0) {
  if (attempt >= MAX_PORT_ATTEMPTS) {
    console.error("[System] Health server: не удалось найти свободный порт после", MAX_PORT_ATTEMPTS, "попыток");
    return;
  }

  const server = http.createServer((req, res) => {
    // Только GET /health — всё остальное 404
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        uptime: Math.round(process.uptime()),
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        timestamp: new Date().toISOString(),
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      setTimeout(() => {
        server.close();
        startHealthServer(portToTry + 1, attempt + 1);
      }, 500);
    } else {
      console.error("[System] Health server error:", error);
    }
  });

  server.listen(portToTry, "0.0.0.0", () => {
    healthServer = server;
    console.log(`[System] Health server running on ${portToTry}`);
  });
}
