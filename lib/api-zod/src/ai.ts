import { z } from "zod";

const languageSchema = z.enum(["ru", "uz", "en"]);

export const AiAllowedProductSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1),
  sapCode: z.string().trim().min(1).nullable().optional(),
  segment: z.string().trim().min(1).nullable().optional(),
  purpose: z.string().trim().min(1).nullable().optional(),
  highlight: z.string().trim().min(1).nullable().optional(),
  loanAmount: z.string().trim().min(1).nullable().optional(),
  termWorkingCapital: z.string().trim().min(1).nullable().optional(),
  termFixedAssets: z.string().trim().min(1).nullable().optional(),
  termUntargeted: z.string().trim().min(1).nullable().optional(),
  rateUZS: z.string().trim().min(1).nullable().optional(),
  rateUSD: z.string().trim().min(1).nullable().optional(),
  rateEUR: z.string().trim().min(1).nullable().optional(),
  disbursementForm: z.string().trim().min(1).nullable().optional(),
  whySuitable: z.string().trim().min(1).nullable().optional(),
});

export const AiQuestionAnswerSchema = z.object({
  questionKey: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

export const AiGeneratedQuestionOptionSchema = z.object({
  value: z.string().trim().min(1),
  label: z.string().trim().min(1),
});

export const AiGeneratedQuestionSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  type: z.enum(["select", "input"]),
  placeholder: z.string().trim().min(1).nullable().optional(),
  helperText: z.string().trim().min(1).nullable().optional(),
  options: z.array(AiGeneratedQuestionOptionSchema).max(8).default([]),
});

export const AiGenerateQuestionsBody = z.object({
  language: languageSchema.default("uz"),
  existingAnswers: z.array(AiQuestionAnswerSchema).default([]),
  maxQuestions: z.number().int().min(1).max(6).default(4),
});

export const AiGenerateQuestionsResponse = z.object({
  questions: z.array(AiGeneratedQuestionSchema).max(6).default([]),
});

export const AiRecommendProductsBody = z.object({
  clientBusinessType: z.string().trim().min(1).optional(),
  sector: z.string().trim().min(1).optional(),
  needsGoals: z
    .union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)])
    .optional(),
  requestedAmount: z.union([z.string().trim().min(1), z.number().finite()]).optional(),
  termMonths: z.union([z.string().trim().min(1), z.number().int().positive()]).optional(),
  language: languageSchema.default("uz"),
  questionnaireAnswers: z.array(AiQuestionAnswerSchema).default([]),
  allowedProducts: z.array(AiAllowedProductSchema).default([]),
});

export const AiRecommendProductSchema = z.object({
  productId: z.number().int().positive().nullable().optional(),
  productName: z.string().min(1),
  rank: z.number().int().min(1).max(10),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1),
  localizedSegment: z.string().trim().min(1).nullable().optional(),
  localizedPurpose: z.string().trim().min(1).nullable().optional(),
  localizedHighlight: z.string().trim().min(1).nullable().optional(),
  localizedLoanAmount: z.string().trim().min(1).nullable().optional(),
  localizedRate: z.string().trim().min(1).nullable().optional(),
  localizedRelevantTerm: z.string().trim().min(1).nullable().optional(),
  localizedDisbursementForm: z.string().trim().min(1).nullable().optional(),
  localizedGracePeriod: z.string().trim().min(1).nullable().optional(),
});

export const AiRecommendProductsResponse = z.object({
  recommendations: z.array(AiRecommendProductSchema),
});

export const AiSelectedProductSchema = z.object({
  productId: z.number().int().positive().nullable().optional(),
  productName: z.string().min(1),
  whySuitable: z.string().trim().min(1).nullable().optional(),
  amount: z.union([z.string().trim().min(1), z.number().finite()]).optional(),
  rate: z.string().trim().min(1).nullable().optional(),
  termMonths: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().min(1).nullable().optional(),
});

export const AiCalculatorResultSchema = z.object({
  loanAmount: z.union([z.string().trim().min(1), z.number().finite()]).optional(),
  monthlyPayment: z.union([z.string().trim().min(1), z.number().finite()]).optional(),
  totalPayment: z.union([z.string().trim().min(1), z.number().finite()]).optional(),
  totalInterest: z.union([z.string().trim().min(1), z.number().finite()]).optional(),
  termMonths: z.number().int().positive().optional(),
  interestRate: z.union([z.string().trim().min(1), z.number().finite()]).optional(),
  currency: z.string().trim().min(1).optional(),
});

export const AiGenerateOfferSummaryBody = z.object({
  selectedProducts: z.array(AiSelectedProductSchema).min(1),
  calculatorResult: AiCalculatorResultSchema.optional(),
  clientName: z.string().trim().min(1),
  language: languageSchema.default("uz"),
});

export const AiGenerateOfferSummaryResponse = z.object({
  summary: z.string().min(1),
});

export const AiTranslateBody = z.object({
  text: z.string().min(1),
  sourceLanguage: z.enum(["ru", "uz"]),
  targetLanguage: z.enum(["ru", "uz"]),
});

export const AiTranslateResponse = z.object({
  text: z.string(),
});

export const AiExtractAutoBody = z.object({
  images: z.array(z.string().min(1)).min(1).max(8),
  language: languageSchema.default("uz"),
  extraFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  ocrText: z.string().optional(),
});

export const AiExtractAutoResponse = z.object({
  make: z.string().nullable(),
  model: z.string().nullable(),
  vehicleType: z.string().nullable(),
  color: z.string().nullable(),
  plateText: z.string().nullable(),
  approximateYear: z.string().nullable(),
  visibleConditionNotes: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rawNotes: z.string().nullable(),
});

export const AiHealthResponse = z.object({
  status: z.enum(["ok", "degraded"]),
  backendHealthy: z.boolean(),
  ollamaReachable: z.boolean(),
  model: z.string(),
  modelAvailable: z.boolean(),
  modelLoaded: z.boolean().nullable(),
});

export type AiRecommendProductsBodyType = z.infer<typeof AiRecommendProductsBody>;
export type AiRecommendProductsResponseType = z.infer<typeof AiRecommendProductsResponse>;
export type AiGenerateQuestionsBodyType = z.infer<typeof AiGenerateQuestionsBody>;
export type AiGenerateQuestionsResponseType = z.infer<typeof AiGenerateQuestionsResponse>;
export type AiGenerateOfferSummaryBodyType = z.infer<typeof AiGenerateOfferSummaryBody>;
export type AiGenerateOfferSummaryResponseType = z.infer<typeof AiGenerateOfferSummaryResponse>;
export type AiTranslateBodyType = z.infer<typeof AiTranslateBody>;
export type AiTranslateResponseType = z.infer<typeof AiTranslateResponse>;
export type AiExtractAutoBodyType = z.infer<typeof AiExtractAutoBody>;
export type AiExtractAutoResponseType = z.infer<typeof AiExtractAutoResponse>;
export type AiHealthResponseType = z.infer<typeof AiHealthResponse>;
