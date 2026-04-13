import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { env } from "./lib/env";

const app: Express = express();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many authentication attempts" });
  },
});

const expensiveRouteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many expensive requests" });
  },
});

const artifactRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const adminPublicDir = path.join(artifactRoot, "admin", "dist", "public");
const adminIndexPath = path.join(adminPublicDir, "index.html");
const miniAppPublicDir = path.join(artifactRoot, "mini-app", "dist", "public");
const miniAppIndexPath = path.join(miniAppPublicDir, "index.html");

function isSpaRoute(pathname: string) {
  return path.extname(pathname) === "";
}

app.set("trust proxy", 1);
app.disable("x-powered-by");

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
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.allowedCorsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
  }),
);
app.use("/api/auth", authLimiter);
app.use("/api/ai", expensiveRouteLimiter);
app.use("/api/ocr", expensiveRouteLimiter);
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use("/api", router);

if (existsSync(miniAppIndexPath)) {
  app.use("/mini-app", express.static(miniAppPublicDir, { index: false }));
  app.use("/mini-app", (req, res, next) => {
    if (req.method !== "GET" || !isSpaRoute(req.path)) {
      next();
      return;
    }

    res.sendFile(miniAppIndexPath);
  });
}

if (existsSync(adminIndexPath)) {
  app.use(express.static(adminPublicDir, { index: false }));
  app.use((req, res, next) => {
    if (
      req.method !== "GET" ||
      !isSpaRoute(req.path) ||
      req.path.startsWith("/api") ||
      req.path.startsWith("/mini-app")
    ) {
      next();
      return;
    }

    res.sendFile(adminIndexPath);
  });
}

export default app;
