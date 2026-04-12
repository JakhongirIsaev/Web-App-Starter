import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

const rawPort = process.env.PORT ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: ${rawPort}`);
}

const publicDir = path.resolve(process.cwd(), process.argv[2] ?? "dist/public");
const indexPath = path.join(publicDir, "index.html");
const apiOrigin =
  process.env.API_ORIGIN?.replace(/\/+$/, "") ||
  process.env.VITE_API_ORIGIN?.replace(/\/+$/, "") ||
  process.env.RAILWAY_SERVICE__WORKSPACE_API_SERVER_URL?.replace(/\/+$/, "") ||
  "";

if (!existsSync(indexPath)) {
  throw new Error(`Missing SPA entrypoint at ${indexPath}`);
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function resolveRequestPath(pathname) {
  const normalizedPath = path.posix.normalize(pathname);
  const relativePath = normalizedPath.replace(/^\/+/, "");
  const absolutePath = path.resolve(publicDir, relativePath);

  if (!absolutePath.startsWith(publicDir)) {
    return null;
  }

  if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
    return absolutePath;
  }

  return path.extname(pathname) === "" ? indexPath : null;
}

function sendFile(req, res, filePath) {
  const stat = statSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes.get(extension) ?? "application/octet-stream";

  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", stat.size);
  res.setHeader(
    "Cache-Control",
    filePath === indexPath ? "no-cache" : "public, max-age=31536000, immutable",
  );

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
}

function shouldProxyApi(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function shouldServeHealthz(pathname) {
  return pathname === "/api/healthz";
}

function sendHealthz(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ status: "ok" }));
}

async function proxyApiRequest(req, res, requestUrl) {
  if (!apiOrigin) {
    res.statusCode = 502;
    res.end("API origin is not configured");
    return;
  }

  const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, `${apiOrigin}/`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    if (["connection", "content-length", "host"].includes(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : Readable.toWeb(req),
    duplex: "half",
    redirect: "manual",
  });

  res.statusCode = upstreamResponse.status;

  upstreamResponse.headers.forEach((value, key) => {
    if (["connection", "content-encoding", "content-length", "transfer-encoding"].includes(key.toLowerCase())) {
      return;
    }
    res.setHeader(key, value);
  });

  if (req.method === "HEAD" || !upstreamResponse.body) {
    res.end();
    return;
  }

  Readable.fromWeb(upstreamResponse.body).pipe(res);
}

createServer(async (req, res) => {
  if (!req.url || !req.method) {
    res.statusCode = req.method ? 405 : 400;
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, "http://127.0.0.1");

  if (shouldServeHealthz(requestUrl.pathname)) {
    sendHealthz(res);
    return;
  }

  if (shouldProxyApi(requestUrl.pathname)) {
    try {
      await proxyApiRequest(req, res, requestUrl);
    } catch (error) {
      console.error("API proxy request failed", error);
      if (!res.headersSent) {
        res.statusCode = 502;
      }
      res.end("Bad Gateway");
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end();
    return;
  }

  const filePath = resolveRequestPath(requestUrl.pathname);

  if (!filePath) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  sendFile(req, res, filePath);
}).listen(port, "0.0.0.0", () => {
  console.log(`Serving ${publicDir} on port ${port}`);
});
