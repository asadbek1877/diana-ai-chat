import http from "http";

export function startHealthServer(portToTry: number) {
  const server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Diana CRM dashboard is alive!\n");
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      setTimeout(() => {
        server.close();
        startHealthServer(portToTry + 1);
      }, 500);
    }
  });

  server.listen(portToTry, () => {
    console.log(`[System] Health server running on ${portToTry}`);
  });
}
