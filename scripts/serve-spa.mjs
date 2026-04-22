import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const distArg = process.argv[2] ?? "dist/public";
const distDir = path.resolve(process.cwd(), distArg);
const basePath = normalizeBasePath(process.env["BASE_PATH"] ?? "/");

const apiProxyTargetRaw = (
  process.env["API_PROXY_TARGET"] ??
  process.env["API_ORIGIN"] ??
  ""
).trim().replace(/\/+$/, "");
const apiProxyTarget = apiProxyTargetRaw ? new URL(apiProxyTargetRaw) : null;

await access(distDir);

const server = http.createServer(async (req, res) => {
  if (apiProxyTarget && shouldProxy(req.url)) {
    proxyApiRequest(req, res, apiProxyTarget);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end("Method not allowed");
    return;
  }

  const incomingUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = decodePathname(incomingUrl.pathname);

  if (basePath !== "/") {
    const withoutTrailingSlash = basePath.slice(0, -1);

    if (pathname === withoutTrailingSlash) {
      res.writeHead(308, { Location: basePath });
      res.end();
      return;
    }

    if (!pathname.startsWith(basePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
  }

  const relativePath = stripBasePath(pathname, basePath);
  const filePath = await resolveResponsePath(relativePath);

  if (!filePath) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const headers = {
    "Content-Type": getContentType(filePath),
    "Cache-Control": getCacheControl(relativePath, filePath),
  };

  res.writeHead(200, headers);

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(
    `Serving ${distDir} on http://0.0.0.0:${port}${basePath === "/" ? "/" : basePath}`,
  );
  if (apiProxyTarget) {
    console.log(`Proxying /api/* -> ${apiProxyTarget.origin}`);
  }
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

function shouldProxy(url) {
  if (!url) return false;
  return url === "/api" || url.startsWith("/api/") || url.startsWith("/api?");
}

function proxyApiRequest(req, res, target) {
  const isHttps = target.protocol === "https:";
  const client = isHttps ? https : http;
  const defaultPort = isHttps ? 443 : 80;

  const { host: _incomingHost, ...passthroughHeaders } = req.headers;

  const options = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port ? Number(target.port) : defaultPort,
    path: req.url,
    method: req.method,
    headers: {
      ...passthroughHeaders,
      host: target.host,
    },
  };

  const proxyReq = client.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error(
      `[proxy] ${req.method} ${req.url} -> ${target.origin}${req.url} failed:`,
      err.message,
    );
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Upstream API unavailable" }));
    } else {
      res.end();
    }
  });

  req.on("aborted", () => {
    proxyReq.destroy();
  });

  req.pipe(proxyReq);
}

function normalizeBasePath(value) {
  const trimmed = value.trim();

  if (!trimmed || trimmed === "/") {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function decodePathname(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function stripBasePath(pathname, currentBasePath) {
  if (currentBasePath === "/") {
    return pathname;
  }

  const stripped = pathname.slice(currentBasePath.length - 1);
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

async function resolveResponsePath(relativePath) {
  const directMatch = await resolveStaticFile(relativePath);
  if (directMatch) {
    return directMatch;
  }

  if (!path.extname(relativePath) || wantsHtmlFallback(relativePath)) {
    return path.join(distDir, "index.html");
  }

  return null;
}

async function resolveStaticFile(relativePath) {
  const candidatePath = path.resolve(distDir, `.${relativePath}`);

  if (!isSafePath(candidatePath)) {
    return null;
  }

  try {
    const candidateStat = await stat(candidatePath);

    if (candidateStat.isDirectory()) {
      const indexPath = path.join(candidatePath, "index.html");
      const indexStat = await stat(indexPath);
      return indexStat.isFile() ? indexPath : null;
    }

    return candidateStat.isFile() ? candidatePath : null;
  } catch {
    return null;
  }
}

function isSafePath(candidatePath) {
  const relative = path.relative(distDir, candidatePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function wantsHtmlFallback(relativePath) {
  return relativePath === "/" || relativePath.endsWith("/");
}

function getContentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".gif":
      return "image/gif";
    case ".html":
      return "text/html; charset=utf-8";
    case ".ico":
      return "image/x-icon";
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".webp":
      return "image/webp";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function getCacheControl(relativePath, filePath) {
  if (relativePath.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }

  if (path.basename(filePath).toLowerCase() === "index.html") {
    return "no-store, max-age=0";
  }

  return "no-cache";
}
