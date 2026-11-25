import express from "express";
import http from "http";
import net from "net";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const HOST = "127.0.0.1";
// The FastAPI engine (main-api.py). This host only serves the UI and proxies to it,
// so compile/copilot/telemetry always come from the real backend.
const API_TARGET = new URL(process.env.MANDALA_API_URL || "http://127.0.0.1:8000");
const API_PORT = Number(API_TARGET.port) || (API_TARGET.protocol === "https:" ? 443 : 80);

const app = express();
const server = http.createServer(app);

function isBackendPath(url?: string): boolean {
  return Boolean(url && (url.startsWith("/api/") || url.startsWith("/ws/")));
}

function proxyHttp(req: express.Request, res: express.Response): void {
  const proxyReq = http.request(
    {
      protocol: API_TARGET.protocol,
      hostname: API_TARGET.hostname,
      port: API_PORT,
      method: req.method,
      path: req.originalUrl,
      headers: { ...req.headers, host: API_TARGET.host },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (error: Error) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
    }
    res.end(
      JSON.stringify({
        status: "error",
        message: `Mandala API unreachable at ${API_TARGET.origin}: ${error.message}`,
      })
    );
  });

  req.pipe(proxyReq);
}

function proxyUpgrade(req: http.IncomingMessage, socket: net.Socket, head: Buffer): void {
  const upstream = net.connect(API_PORT, API_TARGET.hostname, () => {
    const headers = Object.entries({ ...req.headers, host: API_TARGET.host })
      .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .join("\r\n");

    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);

    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
}

// REST + WebSocket traffic goes to the FastAPI engine, everything else to the UI.
app.use((req, res, next) => {
  if (isBackendPath(req.url)) {
    proxyHttp(req, res);
    return;
  }
  next();
});

server.on("upgrade", (req, socket, head) => {
  if (isBackendPath(req.url)) {
    proxyUpgrade(req, socket as net.Socket, head);
  }
  // Any other upgrade (e.g. Vite HMR) belongs to the Vite dev server.
});

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`Mandala UI on http://${HOST}:${PORT} (API proxy -> ${API_TARGET.origin})`);
  });
}

startServer();
