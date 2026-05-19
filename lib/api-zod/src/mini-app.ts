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
  clientId: z.coerce.number().int().positive().nullish(),
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
  // 2026-05-09: optional fees/insurance for indicative TCC calculations.
  // feeOnceAmount — absolute UZS one-off fee at disbursement.
  // feeMonthlyPct — monthly commission as % of remaining balance.
  // insuranceMonthlyPct — monthly insurance premium as % of original principal.
  feeOnceAmount: z.coerce.number().min(0).optional(),
  feeMonthlyPct: z.coerce.number().min(0).max(100).optional(),
  insuranceMonthlyPct: z.coerce.number().min(0).max(100).optional(),
});

// Phase B3a: MiniAppQuestionnaireBody removed alongside the legacy
// /mini-app/questionnaire route. The fixed lead-form persists answers via
// MiniAppCreateClientBody / MiniAppUpdateClientBody directly.

export const MiniAppRecommendBody = z.object({
  clientId: z.number().positive(),
  answers: z.array(z.object({ questionKey: z.string(), answer: z.string() })).optional().default([]),
  language: z.enum(["ru", "uz"]).optional(),
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

// Canonical lead_source values match the clients schema. Keep this list in
// sync with the comment block above clientsTable in lib/db/src/schema/clients.ts
// and with the radio chips on the new-client page.
export const leadSourceSchema = z
  .enum([
    "direct_visit",
    "referral_existing_client",
    "mass_media_tv",
    "mass_media_radio",
    "mass_media_print",
    "mahalla_booklet",
    "walk_in",
    "other",
  ])
  .optional();

export const preferredCurrencySchema = z.enum(["UZS", "USD", "EUR", "RUB"]).optional();

// Phase D2: per-client PDF language preference. Captured during lead creation
// so the leave-behind PDF defaults to the language the client actually reads.
export const preferredLanguageSchema = z.enum(["ru", "uz"]).optional();

const optionalNonEmptyText = z.string().min(1).nullish();
const optionalText = z.string().nullish();

export const MiniAppCreateClientBody = z.object({
  fullName: optionalNonEmptyText,
  phone: optionalText,
  // Optional Telegram @username for the lead. Captured during the visit so
  // the leave-behind PDF can ship to the client's Telegram in Phase C4.
  telegramUsername: optionalText,
  gender: z.enum(["male", "female"]).optional(),
  // Phase E — yuridik nomi (registered legal entity name). Captured at lead
  // time so the credit expert can look up the company in external registries
  // / Google Earth.
  legalName: optionalText,
  businessType: z.string().optional(),
  businessSize: z.string().optional(),
  needType: z.string().optional(),
  loanPurpose: z.string().optional(),
  desiredAmount: desiredAmountSchema,
  desiredTerm: z.string().optional(),
  // B3.2 fixed-form fields. The lead_source / self-check / loan-intent block
  // collects everything the recommendation rule engine needs in one shot.
  leadSource: leadSourceSchema,
  referrerClientId: z.coerce.number().int().positive().optional(),
  selfCheckCitizenshipUz: z.boolean().optional(),
  selfCheckSixMonthsOperation: z.boolean().optional(),
  selfCheckPredominantlyPrivate: z.boolean().optional(),
  selfCheckBranchServiceArea: z.boolean().optional(),
  purpose: z.string().optional(),
  desiredAmountUzs: z.coerce.number().nonnegative().optional(),
  desiredTermMonths: z.coerce.number().int().positive().optional(),
  preferredCurrency: preferredCurrencySchema,
  preferredLanguage: preferredLanguageSchema,
  telegramInitData: z.string().optional(),
  // Phase D1 followup — offline-queue idempotency. The mini-app generates a
  // UUID at first send-attempt time and includes it on every replay. The
  // server uses ON CONFLICT (external_uuid) DO NOTHING + RETURNING to detect
  // a replayed insert and respond with the existing row instead of creating a
  // duplicate. Optional for backward compatibility — when absent, the
  // database default (gen_random_uuid()) supplies a fresh value.
  externalUuid: z.string().uuid().optional(),
});

export const MiniAppUpdateClientBody = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().optional(),
  telegramUsername: z.string().optional(),
  legalName: z.string().optional(),
  status: z.enum([
    "draft",
    "lead",
    "recommendation",
    "basket",
    "pdf_generated",
    "under_review",
    "approved",
    "completed",
    "rejected",
  ]).optional(),
  businessType: z.string().optional(),
  businessSize: z.string().optional(),
  needType: z.string().optional(),
  loanPurpose: z.string().optional(),
  desiredAmount: desiredAmountSchema,
  desiredTerm: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  gender: z.enum(["male", "female"]).optional(),
  clientType: z.enum(["individual", "corporate"]).optional(),
  clientSegment: z.string().optional(),
  // Phase E — credit application fields (filled on client-detail after the
  // lead is saved). When all four are populated, the server auto-promotes
  // status from "lead" to "recommendation" (the repurposed "credit info
  // ready" state).
  purpose: z.string().optional(),
  desiredAmountUzs: z.coerce.number().nonnegative().optional(),
  desiredTermMonths: z.coerce.number().int().positive().optional(),
  preferredCurrency: preferredCurrencySchema,
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
  telegramInitData: z.string().nullish(),
  language: z.enum(["ru", "uz"]).nullish(),
});

export const MiniAppAutoExcelBody = z.object({
  clientId: z.coerce.number().int().positive().optional(),
  docType: z.string().optional(),
  language: z.enum(["ru", "uz"]).optional(),
  ocrText: z.string().optional(),
  imageCount: z.coerce.number().int().min(0).optional(),
  extractedData: z.record(z.string(), z.unknown()).optional(),
});
