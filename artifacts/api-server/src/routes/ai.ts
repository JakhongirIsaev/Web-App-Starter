import { Router, type IRouter, type Request } from "express";
import rateLimit from "express-rate-limit";
import {
  AiAllowedProductSchema,
  AiGenerateOfferSummaryBody,
  AiRecommendProductsBody,
  AiRecommendProductsResponse,
  AiGenerateOfferSummaryResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { guestAuth } from "../middleware/auth";
import { getOllamaConfig, getOllamaHealth } from "../ai/ollama";
import { renderOfferSummary } from "../lib/offer-summary";

const router: IRouter = Router();

// Phase B1: AI calls have been replaced with deterministic logic.
//   - /ai/recommend-products       → ranks the allowedProducts list (no AI)
//   - /ai/generate-offer-summary   → static templated string (no AI)
//   - /ai/translate                → DELETED (mini-app uses i18n bundles)
//   - /ai/extract-auto             → DELETED (manual entry; OCR runs separately)
//   - /ai/generate-questionnaire   → 410 Gone (questionnaire is removed in B3)
// /ai/health is preserved so existing health probes do not regress; Ollama
// itself is decommissioned in B4.

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

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

function getAiErrorMessage(req: Request, key: "invalid" | "recommendations" | "summary") {
  const language = resolveResponseLanguage(req);
  const copy = {
    invalid: { ru: "Некорректный запрос", uz: "Noto'g'ri so'rov" },
    recommendations: { ru: "Не удалось получить рекомендации", uz: "Tavsiyalarni olib bo'lmadi" },
    summary: { ru: "Не удалось сформировать краткое предложение", uz: "Qisqa taklifni shakllantirib bo'lmadi" },
  } as const;
  return copy[key][language];
}

function logAiResult(req: Request, endpoint: string, success: boolean, startedAt: number, err?: unknown) {
  const payload = {
    requestId: getRequestId(req),
    endpoint,
    durationMs: getDurationMs(startedAt),
    success,
  };

  if (success) {
    logger.info(payload, "request completed");
    return;
  }

  logger.error({ ...payload, err }, "request failed");
}

function trimText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function toAmountNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.,-]/g, "").replace(/\s+/g, "").replace(",", ".");
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toRateNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1 ? value / 100 : value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.,-]/g, "").replace(",", ".");
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed > 1 ? parsed / 100 : parsed;
  }
  return 0;
}

function toTermMonths(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.round(value));
  if (typeof value === "string") {
    const match = value.match(/\d+/);
    if (match) return Math.max(1, parseInt(match[0], 10));
  }
  return 12;
}

router.get("/ai/health", guestAuth, async (req, res) => {
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

// /ai/generate-questionnaire: 410 Gone.
// The questionnaire is being replaced by a fixed client form in Phase B3.
// This handler is kept temporarily so old mini-app builds still get a clean
// response. Removed entirely in B4.
router.post("/ai/generate-questionnaire", (_req, res) => {
  res.status(410).json({
    error: "endpoint_removed",
    message:
      "Questionnaire is no longer used. Use the standard /mini-app/clients form.",
  });
});

// /ai/recommend-products: deterministic ranking of the already-filtered
// allowedProducts list provided by the caller. The frontend sends the
// products that /mini-app/recommend already matched against the client; this
// endpoint just produces a stable, deterministic ranking and echoes the
// product fields back as the "localized*" presentation values (no per-locale
// rewriting — UI bundles handle UI strings; product fields are stored as-is
// in the DB and shown directly).
router.post("/ai/recommend-products", aiLimiter, guestAuth, async (req, res) => {
  const startedAt = Date.now();
  const parsed = AiRecommendProductsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: getAiErrorMessage(req, "invalid"), issues: parsed.error.flatten() });
    return;
  }

  try {
    const sanitized = parsed.data.allowedProducts.map((item) =>
      AiAllowedProductSchema.parse(item),
    );

    const recommendations = sanitized.slice(0, 5).map((product, index) => {
      const rateSummary =
        [product.rateUZS, product.rateUSD, product.rateEUR].filter(Boolean).join(" | ") || null;
      const termSummary =
        [product.termWorkingCapital, product.termFixedAssets, product.termUntargeted]
          .filter(Boolean)
          .join(" | ") || null;
      const explanation =
        trimText(product.whySuitable) ||
        trimText(
          [
            product.segment ? `Segment: ${product.segment}.` : "",
            product.purpose ? `Purpose: ${product.purpose}.` : "",
            product.highlight ? `Highlight: ${product.highlight}.` : "",
          ].join(" "),
        ) ||
        "Selected from the allowed catalog.";

      return {
        productId: product.id ?? null,
        productName: product.name,
        rank: index + 1,
        confidence: Number(Math.max(0.4, 0.9 - index * 0.1).toFixed(2)),
        explanation,
        localizedSegment: product.segment ?? null,
        localizedPurpose: product.purpose ?? null,
        localizedHighlight: product.highlight ?? null,
        localizedLoanAmount: product.loanAmount ?? null,
        localizedRate: rateSummary,
        localizedRelevantTerm: termSummary,
        localizedDisbursementForm: product.disbursementForm ?? null,
        localizedGracePeriod: null,
      };
    });

    const result = AiRecommendProductsResponse.parse({ recommendations });
    logAiResult(req, "/api/ai/recommend-products", true, startedAt);
    res.json({ ...result, model: "deterministic" });
  } catch (error) {
    logAiResult(req, "/api/ai/recommend-products", false, startedAt, error);
    res.status(500).json({ error: getAiErrorMessage(req, "recommendations") });
  }
});

// /ai/generate-offer-summary: static templated string. No AI.
router.post("/ai/generate-offer-summary", aiLimiter, guestAuth, async (req, res) => {
  const startedAt = Date.now();
  const parsed = AiGenerateOfferSummaryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: getAiErrorMessage(req, "invalid"), issues: parsed.error.flatten() });
    return;
  }

  try {
    const input = parsed.data;
    const [firstProduct] = input.selectedProducts;
    const calc = input.calculatorResult;
    const language: "ru" | "uz" = input.language === "ru" ? "ru" : "uz";

    const amountUzs = toAmountNumber(calc?.loanAmount ?? firstProduct.amount ?? 0);
    const rateUzs = toRateNumber(calc?.interestRate ?? firstProduct.rate ?? 0);
    const termMonths = toTermMonths(calc?.termMonths ?? firstProduct.termMonths ?? 12);

    const summary = renderOfferSummary(
      {
        clientName: input.clientName,
        productName: firstProduct.productName,
        amountUzs,
        rateUzs,
        termMonths,
      },
      language,
    );

    const result = AiGenerateOfferSummaryResponse.parse({ summary });
    logAiResult(req, "/api/ai/generate-offer-summary", true, startedAt);
    res.json({ ...result, model: "template" });
  } catch (error) {
    logAiResult(req, "/api/ai/generate-offer-summary", false, startedAt, error);
    res.status(500).json({ error: getAiErrorMessage(req, "summary") });
  }
});

// /ai/translate is DELETED — mini-app uses i18n bundles.
// /ai/extract-auto is DELETED — users fill structured fields manually after OCR.

export default router;
