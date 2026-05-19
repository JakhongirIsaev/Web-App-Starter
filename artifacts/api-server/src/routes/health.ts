import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function publicUrl(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim().replace(/\/+$/, "");
    if (!trimmed) continue;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  return null;
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/version", (_req, res) => {
  const gitCommit =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.SOURCE_VERSION ||
    "unknown";

  res.json({
    service: process.env.RAILWAY_SERVICE_NAME || "@workspace/api-server",
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || "unknown",
    gitCommit,
    gitShort: gitCommit === "unknown" ? "unknown" : gitCommit.slice(0, 8),
    canonical: {
      adminUrl: publicUrl(process.env.ADMIN_URL, process.env.RAILWAY_SERVICE__WORKSPACE_ADMIN_URL),
      miniAppUrl: publicUrl(process.env.MINI_APP_URL, process.env.RAILWAY_SERVICE__WORKSPACE_MINI_APP_URL),
      apiUrl: publicUrl(process.env.PUBLIC_API_URL, process.env.RAILWAY_PUBLIC_DOMAIN),
    },
    serverTime: new Date().toISOString(),
  });
});

export default router;
