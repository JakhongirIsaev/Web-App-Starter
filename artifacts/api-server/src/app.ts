import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const trustProxyRaw = process.env.TRUST_PROXY;
if (trustProxyRaw) {
  const parsed = Number(trustProxyRaw);
  app.set("trust proxy", Number.isFinite(parsed) && parsed >= 0 ? parsed : trustProxyRaw);
} else if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Content Security Policy.
// - default-src 'self' keeps the baseline tight.
// - frame-ancestors allows the mini-app to be embedded inside Telegram Web
//   and the Telegram desktop/mobile clients (the official domains are
//   *.telegram.org + web.telegram.org + telegram.org).
// - script-src permits 'unsafe-inline' ONLY because the Vite-built SPAs
//   still emit a small inline bootstrap; we accept it but keep 'unsafe-eval'
//   off so new code paths don't silently regress.
// - style-src allows 'unsafe-inline' for the same reason (Tailwind/shadcn).
// - img-src allows data: + https: so the SPAs can show user-uploaded docs
//   and Telegram-hosted avatars.
// - connect-src 'self' is enough because all XHR is same-origin (/api/*).
//   Add extra hosts here if the mini-app starts calling a third-party API.
// - object-src 'none' blocks legacy <object>/<embed> vectors.
const telegramFrameAncestors = [
  "'self'",
  "https://web.telegram.org",
  "https://*.telegram.org",
  "https://telegram.org",
];
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", "https://telegram.org"],
      "style-src": ["'self'", "'unsafe-inline'", "https:"],
      "img-src": ["'self'", "data:", "https:"],
      "font-src": ["'self'", "data:", "https:"],
      "connect-src": ["'self'"],
      "frame-ancestors": telegramFrameAncestors,
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
    },
  },
  // Keep COEP off — Telegram WebApp bootstrap needs to read postMessage
  // events that would be cross-origin-isolated out of the frame.
  crossOriginEmbedderPolicy: false,
  // CORP "same-origin" would block Telegram Web from embedding us; use
  // "cross-origin" so the iframe can mount while other security headers
  // (CSP frame-ancestors, X-Content-Type-Options) still defend the app.
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

const isProduction = process.env.NODE_ENV === "production";

const productionFallbackOrigins = isProduction
  ? [
      "https://workspaceadmin-production-7e8d.up.railway.app",
      "https://workspacemini-app-production.up.railway.app",
    ]
  : [];

const allowedOrigins = Array.from(new Set([
  process.env.ADMIN_URL,
  process.env.MINI_APP_URL,
  ...((process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
  ...((process.env.EXTRA_CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
  ...productionFallbackOrigins,
].filter((value): value is string => Boolean(value))));

const corsAllowAllInDev = !isProduction && allowedOrigins.length === 0;

if (isProduction && allowedOrigins.length === 0) {
  throw new Error(
    "CORS: no allowed origins configured. Set ADMIN_URL and MINI_APP_URL (or EXTRA_CORS_ORIGINS) in production.",
  );
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !corsAllowAllInDev && !allowedOrigins.includes(origin)) {
    res.status(403).json({ error: "CORS origin not allowed" });
    return;
  }
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (corsAllowAllInDev) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/mini-app") || req.path.startsWith("/admin"),
});

app.use(apiLimiter);

const defaultJsonParser = express.json({ limit: "100kb" });
const documentJsonParser = express.json({ limit: "1mb" });
const largeImageJsonParser = express.json({ limit: "20mb" });

app.use("/api/storage/uploads/direct", largeImageJsonParser);
app.use("/api/ocr/recognize", largeImageJsonParser);
app.use("/api/mini-app/exports/auto-excel", documentJsonParser);
app.use(/^\/api\/mini-app\/(?:clients\/[^/]+\/documents|documents\/[^/]+\/ocr)$/, documentJsonParser);
app.use(defaultJsonParser);
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use("/api", router);

app.use("/api", (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled route error");
  res.status(500).json({ error: "Internal server error" });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

function resolvePublicUrl(value: string | undefined) {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    logger.warn({ value }, "Invalid public URL env value");
    return null;
  }
}

function canonicalSpaUrl(mount: string) {
  if (!isProduction) return null;
  if (mount === "/admin") {
    return resolvePublicUrl(process.env.ADMIN_URL ?? process.env.RAILWAY_SERVICE__WORKSPACE_ADMIN_URL);
  }
  if (mount === "/mini-app") {
    return resolvePublicUrl(process.env.MINI_APP_URL ?? process.env.RAILWAY_SERVICE__WORKSPACE_MINI_APP_URL);
  }
  return null;
}

function redirectToCanonicalSpa(req: express.Request, res: express.Response, canonical: URL) {
  const requestHost = req.get("host");
  if (requestHost === canonical.host) return false;

  const target = new URL(canonical.toString());
  const basePath = target.pathname.replace(/\/$/, "");
  const restPath = req.path === "/" ? "/" : req.path;
  target.pathname = `${basePath}${restPath}`.replace(/\/{2,}/g, "/");

  const queryIndex = req.url.indexOf("?");
  target.search = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
  res.redirect(308, target.toString());
  return true;
}

function mountSpa(mount: string, distRelative: string) {
  const canonical = canonicalSpaUrl(mount);
  if (canonical) {
    app.use(mount, (req, res, next) => {
      if (redirectToCanonicalSpa(req, res, canonical)) return;
      next();
    });
  }

  const distDir = path.join(projectRoot, distRelative);
  if (!existsSync(distDir)) {
    logger.warn({ mount, distDir }, "SPA dist not found — skipping");
    return;
  }
  app.use(mount, express.static(distDir, {
    fallthrough: true,
    index: false,
    setHeaders(res, filePath) {
      const relativePath = path.relative(distDir, filePath).replace(/\\/g, "/");
      if (relativePath === "index.html") {
        res.setHeader("Cache-Control", "no-store, max-age=0");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        return;
      }
      if (relativePath.startsWith("assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=300");
    },
  }));
  app.use(mount, (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (path.extname(req.path)) {
      res.status(404).send("Not found");
      return;
    }
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.join(distDir, "index.html"));
  });
}

mountSpa("/mini-app", "artifacts/mini-app/dist/public");
mountSpa("/admin", "artifacts/admin/dist/public");

// deploy-trigger: 2026-04-16T11:30Z (mini-app i18n + favicon revert)

export default app;
