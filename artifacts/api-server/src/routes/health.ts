import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { aiHealthCheck } from "../lib/ai-client";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/ai/health", async (_req, res) => {
  const result = await aiHealthCheck();
  res.status(result.ok ? 200 : 503).json(result);
});

export default router;
