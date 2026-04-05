import {
  AiAllowedProductSchema,
  AiExtractAutoBodyType,
  AiExtractAutoResponse,
  AiExtractAutoResponseType,
  AiGenerateOfferSummaryBodyType,
  AiGenerateOfferSummaryResponse,
  AiGenerateQuestionsBodyType,
  AiGenerateQuestionsResponse,
  AiGenerateQuestionsResponseType,
  AiQuestionAnswerSchema,
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

const QUESTION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "type", "options"],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: ["select", "input"] },
          placeholder: { type: ["string", "null"] },
          helperText: { type: ["string", "null"] },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["value", "label"],
              properties: {
                value: { type: "string" },
                label: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

const TRANSLATE_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: {
    text: { type: "string" },
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

function trimMultilineText(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function looksMostlyCyrillic(value: string): boolean {
  const cyrillic = countMatches(value, /[\u0400-\u04FF]/g);
  const latin = countMatches(value, /[A-Za-z]/g);
  return cyrillic > 0 && cyrillic >= latin;
}

function looksLikeUzbekLatin(value: string): boolean {
  const cyrillic = countMatches(value, /[\u0400-\u04FF]/g);
  const latin = countMatches(value, /[A-Za-z]/g);
  return latin > 0 && cyrillic <= Math.max(1, Math.floor(latin / 4));
}

function shouldRetryTranslation(
  sourceText: string,
  targetLanguage: "ru" | "uz",
  translatedText: string,
): boolean {
  const sourceHasLetters = /[A-Za-z\u0400-\u04FF]/.test(sourceText);
  if (!sourceHasLetters || translatedText.length < 3) return true;
  if (targetLanguage === "ru") return !looksMostlyCyrillic(translatedText);
  return !looksLikeUzbekLatin(translatedText);
}

function buildQuestionOption(
  value: string,
  uz: string,
  ru: string,
  en: string,
  language: "ru" | "uz" | "en",
) {
  if (language === "ru") return { value, label: ru };
  if (language === "en") return { value, label: en };
  return { value, label: uz };
}

function buildFallbackQuestions(
  input: AiGenerateQuestionsBodyType,
): AiGenerateQuestionsResponseType {
  const answerMap = new Map(
    input.existingAnswers.map(
      (item: AiGenerateQuestionsBodyType["existingAnswers"][number]) => [
        item.questionKey,
        item.answer,
      ],
    ),
  );
  const language = input.language;
  const fallbackQuestions = [
    {
      key: "monthly_turnover_range",
      label:
        language === "ru"
          ? "Какой диапазон ежемесячного оборота у клиента?"
          : language === "en"
            ? "What is the client's approximate monthly turnover?"
            : "Mijozning oylik aylanmasi taxminan qaysi diapazonda?",
      type: "select" as const,
      helperText:
        language === "ru"
          ? "Это помогает точнее подобрать лимит и формат продукта."
          : language === "en"
            ? "This helps choose a suitable limit and product format."
            : "Bu mos limit va mahsulot formatini aniqlashga yordam beradi.",
      options: [
        buildQuestionOption("up_to_500m", "500 mln so'mgacha", "До 500 млн сум", "Up to 500m UZS", language),
        buildQuestionOption("500m_to_2b", "500 mln - 2 mlrd so'm", "500 млн - 2 млрд сум", "500m to 2b UZS", language),
        buildQuestionOption("over_2b", "2 mlrd so'mdan yuqori", "Свыше 2 млрд сум", "Over 2b UZS", language),
        buildQuestionOption("not_sure", "Aniq emas", "Пока неясно", "Not sure yet", language),
      ],
    },
    {
      key: "has_collateral",
      label:
        language === "ru"
          ? "Есть ли у клиента залог или имущество для обеспечения?"
          : language === "en"
            ? "Does the client have collateral or assets for security?"
            : "Mijozda ta'minot yoki garovga qo'yiladigan aktiv bormi?",
      type: "select" as const,
      helperText:
        language === "ru"
          ? "Ответ помогает не показывать неподходящие варианты."
          : language === "en"
            ? "This helps avoid showing unsuitable options."
            : "Bu mos bo'lmagan variantlarni qisqartirishga yordam beradi.",
      options: [
        buildQuestionOption("yes", "Ha", "Да", "Yes", language),
        buildQuestionOption("no", "Yo'q", "Нет", "No", language),
        buildQuestionOption("not_sure", "Hali noma'lum", "Пока неизвестно", "Not sure yet", language),
      ],
    },
    {
      key: "preferred_currency",
      label:
        language === "ru"
          ? "В какой валюте клиенту удобнее оформлять продукт?"
          : language === "en"
            ? "Which currency is more convenient for the client?"
            : "Mijozga mahsulot qaysi valyutada qulayroq?",
      type: "select" as const,
      options: [
        buildQuestionOption("uzs", "So'm", "Сум", "UZS", language),
        buildQuestionOption("usd", "Dollar", "Доллар", "USD", language),
        buildQuestionOption("eur", "Yevro", "Евро", "EUR", language),
        buildQuestionOption("not_sure", "Hali aniqlanmagan", "Пока не определено", "Not decided yet", language),
      ],
    },
    {
      key: "needs_quick_disbursement",
      label:
        language === "ru"
          ? "Нужна ли клиенту максимально быстрая выдача?"
          : language === "en"
            ? "Does the client need the fastest possible disbursement?"
            : "Mijozga mablag'ni tez ajratish muhimmi?",
      type: "select" as const,
      options: [
        buildQuestionOption("yes", "Ha, tez kerak", "Да, важно быстро", "Yes, urgently", language),
        buildQuestionOption("flexible", "Muddat bo'yicha moslashuvchan", "Срок гибкий", "Flexible timing", language),
        buildQuestionOption("not_sure", "Hali noma'lum", "Пока неизвестно", "Not sure yet", language),
      ],
    },
  ];

  return AiGenerateQuestionsResponse.parse({
    questions: fallbackQuestions
      .filter((question) => !answerMap.has(question.key))
      .slice(0, input.maxQuestions),
  });
}

function fallbackRecommendation(input: AiRecommendProductsBodyType) {
  const recommendations = input.allowedProducts.slice(0, 5).map((product, index) => ({
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
      `${input.clientName} uchun asosiy taklif: ${firstProduct.productName}.`,
      calc?.loanAmount && calc?.currency
        ? `Hisob-kitob bo'yicha kredit summasi ${calc.loanAmount} ${calc.currency}.`
        : "",
      calc?.termMonths ? `Tavsiya etilgan muddat ${calc.termMonths} oy.` : "",
      calc?.monthlyPayment && calc?.currency
        ? `Taxminiy oylik to'lov ${calc.monthlyPayment} ${calc.currency}.`
        : "",
    ],
    ru: [
      `Для клиента подготовлен основной вариант ${firstProduct.productName}.`,
      calc?.loanAmount && calc?.currency
        ? `По расчету сумма кредита составляет ${calc.loanAmount} ${calc.currency}.`
        : "",
      calc?.termMonths ? `Рекомендуемый срок: ${calc.termMonths} мес.` : "",
      calc?.monthlyPayment && calc?.currency
        ? `Ориентировочный ежемесячный платеж: ${calc.monthlyPayment} ${calc.currency}.`
        : "",
    ],
    en: [
      `The main offer for ${input.clientName} is ${firstProduct.productName}.`,
      calc?.loanAmount && calc?.currency
        ? `The calculated loan amount is ${calc.loanAmount} ${calc.currency}.`
        : "",
      calc?.termMonths ? `Recommended term: ${calc.termMonths} months.` : "",
      calc?.monthlyPayment && calc?.currency
        ? `Estimated monthly payment: ${calc.monthlyPayment} ${calc.currency}.`
        : "",
    ],
  } as const;

  return AiGenerateOfferSummaryResponse.parse({
    summary: summaryPartsByLanguage[language].filter(Boolean).join(" "),
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

function mergeAutoExtractionWithFallback(
  extracted: AiExtractAutoResponseType,
  fallback: AiExtractAutoResponseType,
): AiExtractAutoResponseType {
  return AiExtractAutoResponse.parse({
    make: extracted.make ?? fallback.make,
    model: extracted.model ?? fallback.model,
    vehicleType: extracted.vehicleType ?? fallback.vehicleType,
    color: extracted.color ?? fallback.color,
    plateText: extracted.plateText ?? fallback.plateText,
    approximateYear: extracted.approximateYear ?? fallback.approximateYear,
    visibleConditionNotes: extracted.visibleConditionNotes ?? fallback.visibleConditionNotes,
    confidence: Math.max(extracted.confidence ?? 0, fallback.confidence ?? 0),
    rawNotes: extracted.rawNotes ?? fallback.rawNotes,
  });
}

export async function generateFollowUpQuestions(input: AiGenerateQuestionsBodyType) {
  const existingAnswers = input.existingAnswers.map(
    (item: AiGenerateQuestionsBodyType["existingAnswers"][number]) =>
      AiQuestionAnswerSchema.parse(item),
  );
  const existingKeys = new Set(
    existingAnswers.map((item: typeof existingAnswers[number]) => item.questionKey),
  );

  try {
    const { data, model } = await ollamaChatJson<unknown>({
      format: QUESTION_RESPONSE_SCHEMA,
      timeoutMs: 40_000,
      messages: [
        {
          role: "system",
          content: [
            "You are a banking workflow assistant for a Telegram Mini App.",
            "Create concise follow-up questionnaire items for a credit expert.",
            "Return valid JSON only.",
            "Ask at most the requested number of questions.",
            "Do not repeat already answered question keys.",
            "Do not repeat base question keys.",
            "Prefer select questions with 3 to 4 clear options.",
            "Use meaningful snake_case keys.",
            "Do not invent policies, rates, or eligibility rules.",
            "Questions must help choose a bank product in a structured workflow.",
            languageInstruction(input.language),
          ].join(" "),
        },
        {
          role: "user",
          content: compactJson({
            maxQuestions: input.maxQuestions,
            existingAnswers,
            forbiddenQuestionKeys: Array.from(existingKeys),
            baseQuestionKeys: [
              "business_type",
              "business_size",
              "need_type",
              "loan_purpose",
              "desired_amount",
              "desired_term",
            ],
          }),
        },
      ],
    });

    const parsed = AiGenerateQuestionsResponse.parse(data);
    return {
      questions: parsed.questions
        .filter(
          (question: AiGenerateQuestionsResponseType["questions"][number]) =>
            !existingKeys.has(question.key),
        )
        .slice(0, input.maxQuestions)
        .map((question: AiGenerateQuestionsResponseType["questions"][number]) => ({
          ...question,
          options: question.type === "select" ? question.options.slice(0, 6) : [],
        })),
      model,
    };
  } catch {
    return {
      ...buildFallbackQuestions({
        ...input,
        existingAnswers,
      }),
      model: "fallback",
    };
  }
}

export async function recommendAllowedProducts(input: AiRecommendProductsBodyType) {
  const sanitizedProducts = input.allowedProducts.map((item) =>
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
            questionnaireAnswers: input.questionnaireAnswers ?? [],
            allowedProducts: sanitizedProducts.map((product) => ({
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

    return {
      ...AiRecommendProductsResponse.parse(data),
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
            "Write only client-facing text.",
            "Do not mention internal reasoning or why the product was selected.",
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

  const translateOnce = async (retry = false) => {
    const { data, model } = await ollamaChatJson<{ text: string }>({
      format: TRANSLATE_RESPONSE_SCHEMA,
      timeoutMs: 30_000,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "You are a translation helper in a banking workflow.",
            `Translate from ${sourceLabel} to ${targetLabel}.`,
            input.targetLanguage === "uz"
              ? "Output Uzbek in Latin script only. Do not use Cyrillic."
              : "Output Russian in natural Cyrillic.",
            "Return JSON with one field: text.",
            "Preserve names, numbers, identifiers, VIN, plate text, passport numbers, phone numbers, and currency values.",
            "Do not add explanations, comments, or markdown.",
            retry
              ? "The previous attempt was not translated correctly. Translate the content faithfully now."
              : "Translate the content faithfully.",
          ].join(" "),
        },
        {
          role: "user",
          content: input.text,
        },
      ],
    });

    return {
      model,
      text: trimMultilineText(data.text || ""),
    };
  };

  let translated = await translateOnce(false);
  if (shouldRetryTranslation(input.text, input.targetLanguage, translated.text)) {
    translated = await translateOnce(true);
  }

  if (!translated.text) {
    throw new Error("Translation returned empty text");
  }

  return translated;
}

export async function extractAutoDetails(input: AiExtractAutoBodyType) {
  const ocrFallback = fallbackAutoExtractionFromOcr(input.ocrText);

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
      ...mergeAutoExtractionWithFallback(
        AiExtractAutoResponse.parse(data),
        ocrFallback,
      ),
      model,
    };
  } catch {
    return {
      ...ocrFallback,
      model: "fallback",
    };
  }
}
