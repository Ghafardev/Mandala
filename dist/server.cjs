var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_http = __toESM(require("http"), 1);
var import_net = __toESM(require("net"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var PORT = Number(process.env.PORT) || 3e3;
var HOST = "127.0.0.1";
var API_TARGET = new URL(process.env.MANDALA_API_URL || "http://127.0.0.1:8000");
var API_PORT = Number(API_TARGET.port) || (API_TARGET.protocol === "https:" ? 443 : 80);
var app = (0, import_express.default)();
var server = import_http.default.createServer(app);
function isBackendPath(url) {
  return Boolean(url && (url.startsWith("/api/") || url.startsWith("/ws/")));
}
function proxyHttp(req, res) {
  const proxyReq = import_http.default.request(
    {
      protocol: API_TARGET.protocol,
      hostname: API_TARGET.hostname,
      port: API_PORT,
      method: req.method,
      path: req.originalUrl,
      headers: { ...req.headers, host: API_TARGET.host }
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", (error) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
    }
    res.end(
      JSON.stringify({
        status: "error",
        message: `Mandala API unreachable at ${API_TARGET.origin}: ${error.message}`
      })
    );
  });
  req.pipe(proxyReq);
}
function proxyUpgrade(req, socket, head) {
  const upstream = import_net.default.connect(API_PORT, API_TARGET.hostname, () => {
    const headers = Object.entries({ ...req.headers, host: API_TARGET.host }).map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(", ") : value}`).join("\r\n");
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r
${headers}\r
\r
`);
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
}
app.use((req, res, next) => {
  if (isBackendPath(req.url)) {
    proxyHttp(req, res);
    return;
  }
  next();
});
server.on("upgrade", (req, socket, head) => {
  if (isBackendPath(req.url)) {
    proxyUpgrade(req, socket, head);
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  server.listen(PORT, HOST, () => {
    console.log(`Mandala UI on http://${HOST}:${PORT} (API proxy -> ${API_TARGET.origin})`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
