import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const artifactRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const adminPublicDir = path.join(artifactRoot, "admin", "dist", "public");
const adminIndexPath = path.join(adminPublicDir, "index.html");
const miniAppPublicDir = path.join(artifactRoot, "mini-app", "dist", "public");
const miniAppIndexPath = path.join(miniAppPublicDir, "index.html");

function isSpaRoute(pathname: string) {
  return path.extname(pathname) === "";
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
app.use(cors());
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
