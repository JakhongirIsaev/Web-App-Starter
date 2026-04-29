import { Router, type IRouter, type Request } from "express";
import {
  AiExtractAutoBody,
  AiGenerateOfferSummaryBody,
  AiGenerateQuestionsBody,
  AiRecommendProductsBody,
  AiTranslateBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { guestAuth } from "../middleware/auth";
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

function resolveResponseLanguage(req: Request): "ru" | "uz" {
  const body = req.body as { language?: unknown; targetLanguage?: unknown } | undefined;
  if (body?.language === "ru" || body?.targetLanguage === "ru") return "ru";
  return "uz";
}

function getAiErrorMessage(req: Request, key: "invalid" | "questions" | "recommendations" | "summary" | "translation" | "vehicle") {
  const language = resolveResponseLanguage(req);
  const copy = {
    invalid: { ru: "Некорректный запрос", uz: "Noto'g'ri so'rov" },
    questions: { ru: "Не удалось сформировать вопросы", uz: "Savollarni shakllantirib bo'lmadi" },
    recommendations: { ru: "Не удалось получить рекомендации", uz: "Tavsiyalarni olib bo'lmadi" },
    summary: { ru: "Не удалось сформировать краткое предложение", uz: "Qisqa taklifni shakllantirib bo'lmadi" },
    translation: { ru: "Не удалось выполнить перевод", uz: "Tarjimani bajarib bo'lmadi" },
    vehicle: { ru: "Не удалось извлечь данные автомобиля", uz: "Avtomobil ma'lumotlarini ajratib bo'lmadi" },
  } as const;
  return copy[key][language];
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

router.post("/ai/generate-questionnaire", guestAuth, async (req, res) => {
  const startedAt = Date.now();
  const parsed = AiGenerateQuestionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: getAiErrorMessage(req, "invalid"), issues: parsed.error.flatten() });
    return;
  }

  try {
    const result = await generateFollowUpQuestions(parsed.data);
    logAiResult(req, "/api/ai/generate-questionnaire", true, startedAt);
    res.json(result);
  } catch (error) {
    logAiResult(req, "/api/ai/generate-questionnaire", false, startedAt, error);
    const status = error instanceof OllamaRequestError ? error.status : 503;
    res.status(status).json({ error: getAiErrorMessage(req, "questions") });
  }
});

router.post("/ai/recommend-products", guestAuth, async (req, res) => {
  const startedAt = Date.now();
  const parsed = AiRecommendProductsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: getAiErrorMessage(req, "invalid"), issues: parsed.error.flatten() });
    return;
  }

  try {
    const result = await recommendAllowedProducts(parsed.data);
    logAiResult(req, "/api/ai/recommend-products", true, startedAt);
    res.json(result);
  } catch (error) {
    logAiResult(req, "/api/ai/recommend-products", false, startedAt, error);
    const status = error instanceof OllamaRequestError ? error.status : 503;
    res.status(status).json({ error: getAiErrorMessage(req, "recommendations") });
  }
});

router.post("/ai/generate-offer-summary", guestAuth, async (req, res) => {
  const startedAt = Date.now();
  const parsed = AiGenerateOfferSummaryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: getAiErrorMessage(req, "invalid"), issues: parsed.error.flatten() });
    return;
  }

  try {
    const result = await generateOfferSummary(parsed.data);
    logAiResult(req, "/api/ai/generate-offer-summary", true, startedAt);
    res.json(result);
  } catch (error) {
    logAiResult(req, "/api/ai/generate-offer-summary", false, startedAt, error);
    const status = error instanceof OllamaRequestError ? error.status : 503;
    res.status(status).json({ error: getAiErrorMessage(req, "summary") });
  }
});

router.post("/ai/translate", guestAuth, async (req, res) => {
  const startedAt = Date.now();
  const parsed = AiTranslateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: getAiErrorMessage(req, "invalid"), issues: parsed.error.flatten() });
    return;
  }

  try {
    const result = await translateText(parsed.data);
    logAiResult(req, "/api/ai/translate", true, startedAt);
    res.json(result);
  } catch (error) {
    logAiResult(req, "/api/ai/translate", false, startedAt, error);
    const status = error instanceof OllamaRequestError ? error.status : 503;
    res.status(status).json({ error: getAiErrorMessage(req, "translation") });
  }
});

router.post("/ai/extract-auto", guestAuth, async (req, res) => {
  const startedAt = Date.now();
  const parsed = AiExtractAutoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: getAiErrorMessage(req, "invalid"), issues: parsed.error.flatten() });
    return;
  }

  try {
    const result = await extractAutoDetails(parsed.data);
    logAiResult(req, "/api/ai/extract-auto", true, startedAt);
    res.json(result);
  } catch (error) {
    logAiResult(req, "/api/ai/extract-auto", false, startedAt, error);
    const status = error instanceof OllamaRequestError ? error.status : 503;
    res.status(status).json({ error: getAiErrorMessage(req, "vehicle") });
  }
});

export default router;
