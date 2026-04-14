import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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

app.use("/api", (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled route error");
  res.status(500).json({ error: err?.message || "Internal server error" });
});

// Static SPAs (mini-app + admin) bundled alongside the server image so the
// Telegram mini-app URL can stay on a single origin. Vite builds them with
// BASE_PATH=/mini-app/ and /admin/ so asset URLs resolve correctly.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

function mountSpa(mount: string, distRelative: string) {
  const distDir = path.join(projectRoot, distRelative);
  if (!existsSync(distDir)) {
    logger.warn({ mount, distDir }, "SPA dist not found — skipping");
    return;
  }
  app.use(mount, express.static(distDir, { fallthrough: true, index: false }));
  app.use(mount, (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

mountSpa("/mini-app", "artifacts/mini-app/dist/public");
mountSpa("/admin", "artifacts/admin/dist/public");

export default app;
