import { Router, type IRouter, type Request } from "express";
import {
  AiExtractAutoBody,
  AiGenerateOfferSummaryBody,
  AiGenerateQuestionsBody,
  AiRecommendProductsBody,
  AiTranslateBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import { getOllamaConfig, getOllamaHealth, OllamaRequestError } from "../ai/ollama";
import {
  extractAutoDetails,
  generateOfferSummary,
  generateFollowUpQuestions,
  recommendAllowedProducts,
  translateText,
} from "../ai/service";

const router: IRouter = Router();

function getRequestId(req: Request): string {
  const candidate = (req as Request & { id?: string }).id;
  return typeof candidate === "string" && candidate.trim() !== "" ? candidate : "unknown";
}

function getDurationMs(startedAt: number) {
  return Date.now() - startedAt;
}

function logAiResult(req: Request, endpoint: string, success: boolean, startedAt: number, err?: unknown) {
  const { model } = getOllamaConfig();
  const payload = {
    requestId: getRequestId(req),
    endpoint,
    model,
    durationMs: getDurationMs(startedAt),
    success,
  };

  if (success) {
    logger.info(payload, "AI request completed");
    return;
  }

  logger.error({ ...payload, err }, "AI request failed");
}

router.get("/ai/health", async (req, res) => {
  const startedAt = Date.now();
  try {
    const health = await getOllamaHealth();
    logAiResult(req, "/api/ai/health", true, startedAt);
    res.json(health);
  } catch (error) {
    logAiResult(req, "/api/ai/health", false, startedAt, error);
    res.status(503).json({
      status: "degraded",
      backendHealthy: true,
      ollamaReachable: false,
      model: getOllamaConfig().model,
      modelAvailable: false,
      modelLoaded: null,
    });
  }
});

router.post("/ai/generate-questionnaire", requireAuth, async (req, res) => {
  const startedAt = Date.now();
  const parsed = AiGenerateQuestionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.flatten() });
    return;
  }

  try {
    const result = await generateFollowUpQuestions(parsed.data);
    logAiResult(req, "/api/ai/generate-questionnaire", true, startedAt);
    res.json(result);
  } catch (error) {
    logAiResult(req, "/api/ai/generate-questionnaire", false, startedAt, error);
    const status = error instanceof OllamaRequestError ? error.status : 503;
    res.status(status).json({ error: error instanceof Error ? error.message : "Question generation failed" });
  }
});

router.post("/ai/recommend-products", requireAuth, async (req, res) => {
  const startedAt = Date.now();
  const parsed = AiRecommendProductsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.flatten() });
    return;
  }

  try {
    const result = await recommendAllowedProducts(parsed.data);
    logAiResult(req, "/api/ai/recommend-products", true, startedAt);
    res.json(result);
  } catch (error) {
    logAiResult(req, "/api/ai/recommend-products", false, startedAt, error);
    const status = error instanceof OllamaRequestError ? error.status : 503;
    res.status(status).json({ error: error instanceof Error ? error.message : "Recommendation failed" });
  }
});

router.post("/ai/generate-offer-summary", requireAuth, async (req, res) => {
  const startedAt = Date.now();
  const parsed = AiGenerateOfferSummaryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.flatten() });
    return;
  }

  try {
    const result = await generateOfferSummary(parsed.data);
    logAiResult(req, "/api/ai/generate-offer-summary", true, startedAt);
    res.json(result);
  } catch (error) {
    logAiResult(req, "/api/ai/generate-offer-summary", false, startedAt, error);
    const status = error instanceof OllamaRequestError ? error.status : 503;
    res.status(status).json({ error: error instanceof Error ? error.message : "Summary generation failed" });
  }
});

router.post("/ai/translate", requireAuth, async (req, res) => {
  const startedAt = Date.now();
  const parsed = AiTranslateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.flatten() });
    return;
  }

  try {
    const result = await translateText(parsed.data);
    logAiResult(req, "/api/ai/translate", true, startedAt);
    res.json(result);
  } catch (error) {
    logAiResult(req, "/api/ai/translate", false, startedAt, error);
    const status = error instanceof OllamaRequestError ? error.status : 503;
    res.status(status).json({ error: error instanceof Error ? error.message : "Translation failed" });
  }
});

router.post("/ai/extract-auto", requireAuth, async (req, res) => {
  const startedAt = Date.now();
  const parsed = AiExtractAutoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.flatten() });
    return;
  }

  try {
    const result = await extractAutoDetails(parsed.data);
    logAiResult(req, "/api/ai/extract-auto", true, startedAt);
    res.json(result);
  } catch (error) {
    logAiResult(req, "/api/ai/extract-auto", false, startedAt, error);
    const status = error instanceof OllamaRequestError ? error.status : 503;
    res.status(status).json({ error: error instanceof Error ? error.message : "Vehicle extraction failed" });
  }
});

export default router;
