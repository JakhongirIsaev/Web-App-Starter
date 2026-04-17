/**
 * Zod schemas for mini-app endpoints.
 * Extracted from artifacts/api-server/src/routes/mini-app.ts to share
 * validation between the server and any future client-side usage.
 */
import { z } from "zod";

// Desired loan amount: client stores as string (often space-separated, e.g. "1 000 000").
// Business rule: between 1_000_000 and 100_000_000_000 — matches questionnaire UI bounds.
// Without this refinement a caller hitting the API directly could submit any value.
export const DESIRED_AMOUNT_MIN = 1_000_000;
export const DESIRED_AMOUNT_MAX = 100_000_000_000;

const desiredAmountSchema = z
  .string()
  .optional()
  .refine(
    (v) => {
      if (v === undefined || v === "") return true;
      const digits = v.replace(/[\s\u00A0,_]/g, "");
      if (!/^\d+$/.test(digits)) return false;
      const n = Number(digits);
      return Number.isFinite(n) && n >= DESIRED_AMOUNT_MIN && n <= DESIRED_AMOUNT_MAX;
    },
    {
      message: `desiredAmount must be a number between ${DESIRED_AMOUNT_MIN} and ${DESIRED_AMOUNT_MAX}`,
    },
  );

export const MiniAppCalculateBody = z.object({
  clientId: z.number().optional(),
  productName: z.string().min(1).optional(),
  loanAmount: z.coerce.number().positive(),
  interestRate: z.coerce.number().min(0),
  termMonths: z.coerce.number().int().positive(),
  repaymentType: z.enum(["annuity", "differentiated"]).optional(),
  initialPayment: z.coerce.number().min(0).optional(),
  gracePeriodMonths: z.coerce.number().int().min(0).optional(),
  currency: z.string().optional(),
  productCost: z.coerce.number().positive().optional(),
  downPaymentPct: z.coerce.number().min(0).max(100).optional(),
});

export const MiniAppQuestionnaireBody = z.object({
  clientId: z.number().positive(),
  answers: z.array(z.object({ questionKey: z.string().min(1), answer: z.string() })).min(1),
  // When true, archive the client's active baskets before recording new answers.
  // Default false preserves prior baskets/calculations so historical recommendations remain auditable.
  clearBasket: z.boolean().optional().default(false),
});

export const MiniAppRecommendBody = z.object({
  clientId: z.number().positive(),
  answers: z.array(z.object({ questionKey: z.string(), answer: z.string() })).optional().default([]),
  language: z.enum(["ru", "uz", "en"]).optional(),
});

export const MiniAppBasketBody = z.object({
  clientId: z.number().positive(),
  items: z.array(z.object({
    productType: z.enum(["credit", "non_credit"]),
    productId: z.number().positive().optional(),
    productName: z.string().min(1),
    notes: z.string().optional(),
  })).min(1),
});

export const MiniAppCreateClientBody = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().optional(),
  businessType: z.string().optional(),
  businessSize: z.string().optional(),
  needType: z.string().optional(),
  loanPurpose: z.string().optional(),
  desiredAmount: desiredAmountSchema,
  desiredTerm: z.string().optional(),
  telegramInitData: z.string().optional(),
});

export const MiniAppUpdateClientBody = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().optional(),
  status: z.string().optional(),
  businessType: z.string().optional(),
  businessSize: z.string().optional(),
  needType: z.string().optional(),
  loanPurpose: z.string().optional(),
  desiredAmount: desiredAmountSchema,
  desiredTerm: z.string().optional(),
});

export const MiniAppNoteBody = z.object({
  type: z.string().optional(),
  content: z.string().min(1),
});

export const MiniAppNextActionBody = z.object({
  actionType: z.string().min(1),
  actionDate: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]).optional(),
  description: z.string().optional(),
});

export const MiniAppDocumentBody = z.object({
  docType: z.string().optional(),
  fileName: z.string().min(1),
  storagePath: z.string().min(1),
  ocrText: z.string().optional(),
  extractedData: z.any().optional(),
});

export const MiniAppOcrUpdateBody = z.object({
  ocrText: z.string().optional(),
  extractedData: z.any().optional(),
});

export const MiniAppGeneratePdfBody = z.object({
  sendViaTelegram: z.boolean().optional(),
  telegramInitData: z.string().optional(),
  language: z.enum(["ru", "uz", "en"]).optional(),
});

export const MiniAppAutoExcelBody = z.object({
  clientId: z.coerce.number().int().positive().optional(),
  ocrText: z.string().optional(),
  imageCount: z.coerce.number().int().min(0).optional(),
  extractedData: z.record(z.string(), z.unknown()).optional(),
});
