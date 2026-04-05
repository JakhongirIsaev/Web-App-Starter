import {
  AiAllowedProductSchema,
  AiExtractAutoBodyType,
  AiExtractAutoResponse,
  AiExtractAutoResponseType,
  AiGenerateOfferSummaryBodyType,
  AiGenerateOfferSummaryResponse,
  AiRecommendProductsBodyType,
  AiRecommendProductsResponse,
  AiTranslateBodyType,
} from "@workspace/api-zod";
import { ollamaChatJson, ollamaChatText } from "./ollama";

const RECOMMEND_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["recommendations"],
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["productName", "rank", "confidence", "explanation"],
        properties: {
          productId: { type: ["integer", "null"] },
          productName: { type: "string" },
          rank: { type: "integer", minimum: 1, maximum: 10 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          explanation: { type: "string" },
        },
      },
    },
  },
};

const EXTRACT_AUTO_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "make",
    "model",
    "vehicleType",
    "color",
    "plateText",
    "approximateYear",
    "visibleConditionNotes",
    "confidence",
    "rawNotes",
  ],
  properties: {
    make: { type: ["string", "null"] },
    model: { type: ["string", "null"] },
    vehicleType: { type: ["string", "null"] },
    color: { type: ["string", "null"] },
    plateText: { type: ["string", "null"] },
    approximateYear: { type: ["string", "null"] },
    visibleConditionNotes: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    rawNotes: { type: ["string", "null"] },
  },
};

function languageInstruction(language: "ru" | "uz" | "en") {
  if (language === "ru") return "Write the user-facing text in Russian.";
  if (language === "en") return "Write the user-facing text in English.";
  return "Write the user-facing text in Uzbek.";
}

function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function trimText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function fallbackRecommendation(input: AiRecommendProductsBodyType) {
  const recommendations = input.allowedProducts.slice(0, 5).map((product: AiRecommendProductsBodyType["allowedProducts"][number], index: number) => ({
    productId: product.id ?? null,
    productName: product.name,
    rank: index + 1,
    confidence: Number((Math.max(0.35, 0.8 - index * 0.1)).toFixed(2)),
    explanation:
      trimText(product.whySuitable || "") ||
      trimText(
        [
          product.segment ? `Segment: ${product.segment}.` : "",
          product.purpose ? `Fits the stated need: ${product.purpose}.` : "",
          product.highlight ? `Key advantage: ${product.highlight}.` : "",
        ].join(" "),
      ) ||
      "Selected from the allowed catalog because it fits the current questionnaire profile.",
  }));

  return AiRecommendProductsResponse.parse({ recommendations });
}

function fallbackOfferSummary(input: AiGenerateOfferSummaryBodyType) {
  const [firstProduct] = input.selectedProducts;
  const calc = input.calculatorResult;
  const language: "ru" | "uz" | "en" =
    input.language === "ru" || input.language === "en" ? input.language : "uz";
  const summaryPartsByLanguage = {
    uz: [
      `${input.clientName} uchun tavsiya etilgan asosiy mahsulot: ${firstProduct.productName}.`,
      firstProduct.whySuitable ? `Tanlash sababi: ${firstProduct.whySuitable}.` : "",
      calc?.loanAmount && calc?.currency
        ? `Hisob-kitob bo'yicha kredit summasi ${calc.loanAmount} ${calc.currency}.`
        : "",
      calc?.termMonths ? `Tavsiya etilgan muddat ${calc.termMonths} oy.` : "",
      calc?.monthlyPayment && calc?.currency
        ? `Taxminiy oylik to'lov ${calc.monthlyPayment} ${calc.currency}.`
        : "",
    ],
    ru: [
      `Для клиента ${input.clientName} ключевым вариантом является ${firstProduct.productName}.`,
      firstProduct.whySuitable ? `Причина выбора: ${firstProduct.whySuitable}.` : "",
      calc?.loanAmount && calc?.currency
        ? `По расчету сумма кредита составляет ${calc.loanAmount} ${calc.currency}.`
        : "",
      calc?.termMonths ? `Рекомендуемый срок: ${calc.termMonths} мес.` : "",
      calc?.monthlyPayment && calc?.currency
        ? `Ориентировочный ежемесячный платеж: ${calc.monthlyPayment} ${calc.currency}.`
        : "",
    ],
    en: [
      `The leading option for ${input.clientName} is ${firstProduct.productName}.`,
      firstProduct.whySuitable ? `Why it fits: ${firstProduct.whySuitable}.` : "",
      calc?.loanAmount && calc?.currency
        ? `The calculated loan amount is ${calc.loanAmount} ${calc.currency}.`
        : "",
      calc?.termMonths ? `Recommended term: ${calc.termMonths} months.` : "",
      calc?.monthlyPayment && calc?.currency
        ? `Estimated monthly payment: ${calc.monthlyPayment} ${calc.currency}.`
        : "",
    ],
  } as const;

  const summaryParts = summaryPartsByLanguage[language].filter(Boolean);

  return AiGenerateOfferSummaryResponse.parse({
    summary: summaryParts.join(" "),
  });
}

function fallbackAutoExtractionFromOcr(ocrText?: string | null): AiExtractAutoResponseType {
  const plateMatch = ocrText?.match(/\b(?:\d{2}[A-Z]\d{3}[A-Z]{2}|[A-Z]{1,3}\s?\d{2,4}\s?[A-Z]{1,3})\b/i);
  const yearMatch = ocrText?.match(/\b(19\d{2}|20\d{2})\b/);

  return AiExtractAutoResponse.parse({
    make: null,
    model: null,
    vehicleType: null,
    color: null,
    plateText: plateMatch?.[0] ?? null,
    approximateYear: yearMatch?.[1] ?? null,
    visibleConditionNotes: null,
    confidence: 0.2,
    rawNotes: ocrText ? ocrText.slice(0, 400) : null,
  });
}

export async function recommendAllowedProducts(input: AiRecommendProductsBodyType) {
  const sanitizedProducts = input.allowedProducts.map((item: AiRecommendProductsBodyType["allowedProducts"][number]) =>
    AiAllowedProductSchema.parse(item),
  );
  if (sanitizedProducts.length === 0) {
    return AiRecommendProductsResponse.parse({ recommendations: [] });
  }

  try {
    const { data, model } = await ollamaChatJson<unknown>({
      format: RECOMMEND_RESPONSE_SCHEMA,
      timeoutMs: 45_000,
      messages: [
        {
          role: "system",
          content: [
            "You are a banking workflow assistant.",
            "Return valid JSON only.",
            "Never invent products, rates, policies, or eligibility rules.",
            "Use only the allowed product catalog provided by the backend.",
            "Rank at most 5 products.",
            languageInstruction(input.language),
          ].join(" "),
        },
        {
          role: "user",
          content: compactJson({
            clientBusinessType: input.clientBusinessType ?? null,
            sector: input.sector ?? null,
            needsGoals: input.needsGoals ?? null,
            requestedAmount: input.requestedAmount ?? null,
            termMonths: input.termMonths ?? null,
            allowedProducts: sanitizedProducts.map((product: typeof sanitizedProducts[number]) => ({
              id: product.id ?? null,
              name: product.name,
              segment: product.segment ?? null,
              purpose: product.purpose ?? null,
              highlight: product.highlight ?? null,
              loanAmount: product.loanAmount ?? null,
              termWorkingCapital: product.termWorkingCapital ?? null,
              termFixedAssets: product.termFixedAssets ?? null,
              termUntargeted: product.termUntargeted ?? null,
              rateUZS: product.rateUZS ?? null,
              rateUSD: product.rateUSD ?? null,
              rateEUR: product.rateEUR ?? null,
              disbursementForm: product.disbursementForm ?? null,
              whySuitable: product.whySuitable ?? null,
            })),
          }),
        },
      ],
    });

    const parsed = AiRecommendProductsResponse.parse(data);
    return {
      ...parsed,
      model,
    };
  } catch {
    return {
      ...fallbackRecommendation({ ...input, allowedProducts: sanitizedProducts }),
      model: "fallback",
    };
  }
}

export async function generateOfferSummary(input: AiGenerateOfferSummaryBodyType) {
  try {
    const { content, model } = await ollamaChatText({
      timeoutMs: 35_000,
      messages: [
        {
          role: "system",
          content: [
            "You are a banking workflow assistant.",
            "Write one concise polished offer summary for a client-ready PDF.",
            "Do not mention internal reasoning.",
            "Do not invent products, rates, or terms.",
            "Use only the provided data.",
            languageInstruction(input.language),
          ].join(" "),
        },
        {
          role: "user",
          content: compactJson(input),
        },
      ],
    });

    return {
      ...AiGenerateOfferSummaryResponse.parse({ summary: trimText(content) }),
      model,
    };
  } catch {
    return {
      ...fallbackOfferSummary(input),
      model: "fallback",
    };
  }
}

export async function translateText(input: AiTranslateBodyType) {
  if (input.sourceLanguage === input.targetLanguage) {
    return { text: input.text, model: "passthrough" };
  }

  const sourceLabel = input.sourceLanguage === "ru" ? "Russian" : "Uzbek";
  const targetLabel = input.targetLanguage === "ru" ? "Russian" : "Uzbek";

  const { content, model } = await ollamaChatText({
    timeoutMs: 25_000,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: [
          "You are a translation helper in a banking workflow.",
          `Translate from ${sourceLabel} to ${targetLabel}.`,
          "Return translated text only.",
          "Preserve numbers, names, currency values, and identifiers.",
          "Do not add explanations or markup.",
        ].join(" "),
      },
      {
        role: "user",
        content: input.text,
      },
    ],
  });

  return { text: trimText(content), model };
}

export async function extractAutoDetails(input: AiExtractAutoBodyType) {
  try {
    const { data, model } = await ollamaChatJson<unknown>({
      format: EXTRACT_AUTO_RESPONSE_SCHEMA,
      timeoutMs: 60_000,
      messages: [
        {
          role: "system",
          content: [
            "You analyze vehicle photos for a banking workflow.",
            "Return valid JSON only.",
            "Use null for anything not visible or not inferable.",
            "Do not guess plate text unless it is visible.",
            "Do not include any reasoning.",
            languageInstruction(input.language),
          ].join(" "),
        },
        {
          role: "user",
          content: compactJson({
            task: "Extract structured vehicle details from the provided images.",
            requiredFields: [
              "make",
              "model",
              "vehicleType",
              "color",
              "plateText",
              "approximateYear",
              "visibleConditionNotes",
              "confidence",
              "rawNotes",
            ],
            extraFields: input.extraFields ?? null,
            ocrText: input.ocrText ?? null,
          }),
          images: input.images,
        },
      ],
    });

    return {
      ...AiExtractAutoResponse.parse(data),
      model,
    };
  } catch {
    return {
      ...fallbackAutoExtractionFromOcr(input.ocrText),
      model: "fallback",
    };
  }
}
