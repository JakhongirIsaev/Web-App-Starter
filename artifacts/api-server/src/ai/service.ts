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
          localizedSegment: { type: ["string", "null"] },
          localizedPurpose: { type: ["string", "null"] },
          localizedHighlight: { type: ["string", "null"] },
          localizedLoanAmount: { type: ["string", "null"] },
          localizedRate: { type: ["string", "null"] },
          localizedRelevantTerm: { type: ["string", "null"] },
          localizedDisbursementForm: { type: ["string", "null"] },
          localizedGracePeriod: { type: ["string", "null"] },
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

const LOCALIZED_PRODUCTS_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["products"],
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["productName"],
        properties: {
          productId: { type: ["integer", "null"] },
          productName: { type: "string" },
          localizedSegment: { type: ["string", "null"] },
          localizedPurpose: { type: ["string", "null"] },
          localizedHighlight: { type: ["string", "null"] },
          localizedLoanAmount: { type: ["string", "null"] },
          localizedRate: { type: ["string", "null"] },
          localizedRelevantTerm: { type: ["string", "null"] },
          localizedDisbursementForm: { type: ["string", "null"] },
          localizedGracePeriod: { type: ["string", "null"] },
        },
      },
    },
  },
};

type SupportedLanguage = "ru" | "uz";

interface LocalizedProductPresentation {
  productId?: number | null;
  productName: string;
  localizedSegment?: string | null;
  localizedPurpose?: string | null;
  localizedHighlight?: string | null;
  localizedLoanAmount?: string | null;
  localizedRate?: string | null;
  localizedRelevantTerm?: string | null;
  localizedDisbursementForm?: string | null;
  localizedGracePeriod?: string | null;
}

function languageInstruction(language: SupportedLanguage) {
  if (language === "ru") {
    return "Весь текст для пользователя пишите только на естественном русском языке кириллицей. Английские слова не выводите.";
  }
  return "Foydalanuvchiga ko'rinadigan barcha matnni faqat o'zbek lotin yozuvida yozing. Inglizcha so'z chiqarmang.";
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
  language: SupportedLanguage,
) {
  if (language === "ru") return { value, label: ru };
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
  const needType = answerMap.get("need_type");
  const fallbackQuestions = needType === "non_credit" ? [
    {
      key: "service_goal",
      label:
        language === "ru"
          ? "Какой банковский сервис нужен клиенту в первую очередь?"
          : "Mijoz uchun qaysi bank xizmati birinchi navbatda muhim?",
      type: "select" as const,
      helperText:
        language === "ru"
          ? "Это помогает сразу убрать неподходящие некредитные продукты."
          : "Bu nokredit mahsulotlarni tezroq aniqroq tanlashga yordam beradi.",
      options: [
        buildQuestionOption("settlement_account", "Hisob-kitob xizmati", "Расчетный счет", language),
        buildQuestionOption("payment_acceptance", "To'lovlarni qabul qilish", "Прием платежей", language),
        buildQuestionOption("payroll", "Ish haqi loyihasi", "Зарплатный проект", language),
        buildQuestionOption("not_sure", "Hali aniqlanmagan", "Пока не определено", language),
      ],
    },
    {
      key: "monthly_turnover_band",
      label:
        language === "ru"
          ? "Какой ежемесячный оборот ожидается по сервису?"
          : "Xizmat bo'yicha kutilayotgan oylik aylanma qancha?",
      type: "select" as const,
      options: [
        buildQuestionOption("up_to_100m", "100 mln so'mgacha", "До 100 млн сум", language),
        buildQuestionOption("100m_to_500m", "100-500 mln so'm", "100-500 млн сум", language),
        buildQuestionOption("over_500m", "500 mln so'mdan yuqori", "Свыше 500 млн сум", language),
        buildQuestionOption("not_sure", "Hali aniq emas", "Пока неясно", language),
      ],
    },
    {
      key: "has_pos_need",
      label:
        language === "ru"
          ? "Нужны ли клиенту терминалы или онлайн-прием платежей?"
          : "Mijozga terminal yoki onlayn to'lov qabul qilish kerakmi?",
      type: "select" as const,
      options: [
        buildQuestionOption("yes", "Ha", "Да", language),
        buildQuestionOption("no", "Yo'q", "Нет", language),
        buildQuestionOption("not_sure", "Hali aniqlanmagan", "Пока не определено", language),
      ],
    },
    {
      key: "foreign_payments_need",
      label:
        language === "ru"
          ? "Есть ли потребность в валютных или международных платежах?"
          : "Valyuta yoki xalqaro to'lovlarga ehtiyoj bormi?",
      type: "select" as const,
      options: [
        buildQuestionOption("yes", "Ha", "Да", language),
        buildQuestionOption("no", "Yo'q", "Нет", language),
        buildQuestionOption("not_sure", "Hali aniqlanmagan", "Пока не определено", language),
      ],
    },
  ] : [
    {
      key: "preferred_currency",
      label:
        language === "ru"
          ? "В какой валюте клиенту удобнее оформить продукт?"
          : "Mijozga mahsulot qaysi valyutada qulayroq?",
      type: "select" as const,
      helperText:
        language === "ru"
          ? "Это помогает сразу убрать неподходящие валютные варианты."
          : "Bu mos bo'lmagan valyuta variantlarini darhol qisqartirishga yordam beradi.",
      options: [
        buildQuestionOption("uzs", "So'm", "Сум", language),
        buildQuestionOption("usd", "AQSh dollari", "Доллар США", language),
        buildQuestionOption("eur", "Yevro", "Евро", language),
        buildQuestionOption("not_sure", "Hali aniqlanmagan", "Пока не определено", language),
      ],
    },
    {
      key: "monthly_payment_comfort",
      label:
        language === "ru"
          ? "Какой ежемесячный платеж для клиента комфортен?"
          : "Mijoz uchun qaysi oylik to'lov diapazoni qulay?",
      type: "select" as const,
      helperText:
        language === "ru"
          ? "Это помогает подобрать сумму и срок без лишней нагрузки на клиента."
          : "Bu summa va muddatni mijozning pul oqimiga moslashtirishga yordam beradi.",
      options: [
        buildQuestionOption("up_to_10m", "10 mln so'mgacha", "До 10 млн сум", language),
        buildQuestionOption("10m_to_30m", "10-30 mln so'm", "10-30 млн сум", language),
        buildQuestionOption("over_30m", "30 mln so'mdan yuqori", "Свыше 30 млн сум", language),
        buildQuestionOption("not_sure", "Hali aniq emas", "Пока неясно", language),
      ],
    },
    {
      key: "repayment_preference",
      label:
        language === "ru"
          ? "Какой график погашения клиенту удобнее?"
          : "Mijozga qaysi to'lov jadvali qulayroq?",
      type: "select" as const,
      options: [
        buildQuestionOption("annuity", "Har oy bir xil to'lov", "Равный платеж каждый месяц", language),
        buildQuestionOption(
          "differentiated",
          "Boshlanishida katta, keyin kamayadigan",
          "Сначала выше, затем уменьшается",
          language,
        ),
        buildQuestionOption("not_sure", "Ekspert tavsiya bersin", "Пусть эксперт подскажет", language),
      ],
    },
    {
      key: "down_payment_level",
      label:
        language === "ru"
          ? "Какой первоначальный взнос клиент готов внести?"
          : "Mijoz qancha boshlang'ich to'lov kiritishga tayyor?",
      type: "select" as const,
      options: [
        buildQuestionOption("none", "Boshlang'ich to'lovsiz", "Без первоначального взноса", language),
        buildQuestionOption("up_to_20", "20% gacha", "До 20%", language),
        buildQuestionOption("20_to_40", "20-40%", "20-40%", language),
        buildQuestionOption("over_40", "40% dan yuqori", "Свыше 40%", language),
      ],
    },
    {
      key: "needs_grace_period",
      label:
        language === "ru"
          ? "Нужен ли клиенту льготный период до начала основных платежей?"
          : "Mijozga asosiy to'lovlar boshlanishidan oldin imtiyozli davr kerakmi?",
      type: "select" as const,
      options: [
        buildQuestionOption("yes", "Ha", "Да", language),
        buildQuestionOption("no", "Yo'q", "Нет", language),
        buildQuestionOption("not_sure", "Hali aniqlanmagan", "Пока не определено", language),
      ],
    },
  ];

  return AiGenerateQuestionsResponse.parse({
    questions: fallbackQuestions
      .filter((question) => !answerMap.has(question.key))
      .slice(0, input.maxQuestions),
  });
}

function ensureMinimumFollowUpQuestions(
  generatedQuestions: AiGenerateQuestionsResponseType["questions"],
  input: AiGenerateQuestionsBodyType,
): AiGenerateQuestionsResponseType["questions"] {
  const minimumQuestions = Math.min(3, input.maxQuestions);
  const fallbackQuestions = buildFallbackQuestions(input).questions;
  const seenKeys = new Set(generatedQuestions.map((question) => question.key));
  const mergedQuestions = [...generatedQuestions];

  for (const fallbackQuestion of fallbackQuestions) {
    if (mergedQuestions.length >= minimumQuestions) break;
    if (seenKeys.has(fallbackQuestion.key)) continue;
    seenKeys.add(fallbackQuestion.key);
    mergedQuestions.push(fallbackQuestion);
  }

  return mergedQuestions.slice(0, input.maxQuestions);
}

function buildFallbackLocalizedProducts(
  products: Array<{
    productId?: number | null;
    productName: string;
    segment?: string | null;
    purpose?: string | null;
    highlight?: string | null;
    loanAmount?: string | null;
    rateSummary?: string | null;
    relevantTerm?: string | null;
    disbursementForm?: string | null;
    gracePeriod?: string | null;
  }>,
): LocalizedProductPresentation[] {
  return products.map((product) => ({
    productId: product.productId ?? null,
    productName: product.productName,
    localizedSegment: product.segment ?? null,
    localizedPurpose: product.purpose ?? null,
    localizedHighlight: product.highlight ?? null,
    localizedLoanAmount: product.loanAmount ?? null,
    localizedRate: product.rateSummary ?? null,
    localizedRelevantTerm: product.relevantTerm ?? null,
    localizedDisbursementForm: product.disbursementForm ?? null,
    localizedGracePeriod: product.gracePeriod ?? null,
  }));
}

type MergeableRecommendation = {
  productId?: number | null;
  productName: string;
  rank: number;
  confidence: number;
  explanation: string;
  localizedSegment?: string | null;
  localizedPurpose?: string | null;
  localizedHighlight?: string | null;
  localizedLoanAmount?: string | null;
  localizedRate?: string | null;
  localizedRelevantTerm?: string | null;
  localizedDisbursementForm?: string | null;
  localizedGracePeriod?: string | null;
};

function mergeLocalizedPresentation(
  recommendations: MergeableRecommendation[],
  localizedProducts: LocalizedProductPresentation[],
) {
  const localizedMap = new Map(
    localizedProducts.map((product) => [
      `${product.productId ?? "null"}:${product.productName}`,
      product,
    ]),
  );

  return recommendations.map((recommendation) => {
    const localized =
      localizedMap.get(`${recommendation.productId ?? "null"}:${recommendation.productName}`) ??
      null;
    if (!localized) return recommendation;
    return {
      ...recommendation,
      localizedSegment: localized.localizedSegment ?? recommendation.localizedSegment ?? null,
      localizedPurpose: localized.localizedPurpose ?? recommendation.localizedPurpose ?? null,
      localizedHighlight: localized.localizedHighlight ?? recommendation.localizedHighlight ?? null,
      localizedLoanAmount: localized.localizedLoanAmount ?? recommendation.localizedLoanAmount ?? null,
      localizedRate: localized.localizedRate ?? recommendation.localizedRate ?? null,
      localizedRelevantTerm:
        localized.localizedRelevantTerm ?? recommendation.localizedRelevantTerm ?? null,
      localizedDisbursementForm:
        localized.localizedDisbursementForm ?? recommendation.localizedDisbursementForm ?? null,
      localizedGracePeriod: localized.localizedGracePeriod ?? recommendation.localizedGracePeriod ?? null,
    };
  });
}

function fallbackRecommendation(input: AiRecommendProductsBodyType) {
  const language = input.language === "ru" ? "ru" : "uz";
  const recommendations = input.allowedProducts.slice(0, 5).map((product, index) => {
    const fallbackParts = [
      product.segment
        ? language === "ru"
          ? `Сегмент: ${product.segment}.`
          : `Segment: ${product.segment}.`
        : "",
      product.purpose
        ? language === "ru"
          ? `Потребность клиента: ${product.purpose}.`
          : `Mijoz ehtiyoji: ${product.purpose}.`
        : "",
      product.highlight
        ? language === "ru"
          ? `Ключевое преимущество: ${product.highlight}.`
          : `Asosiy afzallik: ${product.highlight}.`
        : "",
    ].join(" ");

    return {
      productId: product.id ?? null,
      productName: product.name,
      rank: index + 1,
      confidence: Number((Math.max(0.35, 0.8 - index * 0.1)).toFixed(2)),
      explanation:
        trimText(product.whySuitable || "") ||
        trimText(fallbackParts) ||
        (language === "ru"
          ? "Выбрано из разрешенного каталога по текущему профилю клиента."
          : "Joriy mijoz profili bo'yicha ruxsat etilgan katalogdan tanlandi."),
      localizedSegment: product.segment ?? null,
      localizedPurpose: product.purpose ?? null,
      localizedHighlight: product.highlight ?? null,
      localizedLoanAmount: product.loanAmount ?? null,
      localizedRate: [product.rateUZS, product.rateUSD, product.rateEUR].filter(Boolean).join(" | ") || null,
      localizedRelevantTerm:
        [product.termWorkingCapital, product.termFixedAssets, product.termUntargeted].filter(Boolean).join(" | ") || null,
      localizedDisbursementForm: product.disbursementForm ?? null,
      localizedGracePeriod: null,
    };
  });

  return AiRecommendProductsResponse.parse({ recommendations });
}

function fallbackOfferSummary(input: AiGenerateOfferSummaryBodyType) {
  const [firstProduct] = input.selectedProducts;
  const calc = input.calculatorResult;
  const language: SupportedLanguage = input.language === "ru" ? "ru" : "uz";

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

export async function localizeProductPresentation(
  products: Array<{
    productId?: number | null;
    productName: string;
    segment?: string | null;
    purpose?: string | null;
    highlight?: string | null;
    loanAmount?: string | null;
    rateSummary?: string | null;
    relevantTerm?: string | null;
    disbursementForm?: string | null;
    gracePeriod?: string | null;
  }>,
  language: SupportedLanguage,
) {
  if (products.length === 0) return [];

  try {
    const { data } = await ollamaChatJson<unknown>({
      format: LOCALIZED_PRODUCTS_RESPONSE_SCHEMA,
      timeoutMs: 15_000,
      temperature: 0,
      think: false,
      messages: [
        {
          role: "system",
          content: [
            "You localize banking product presentation fields for a Telegram Mini App.",
            "Return valid JSON only.",
            language === "ru"
              ? "Translate all user-facing fields to natural Russian in Cyrillic only."
              : "Translate all user-facing fields to Uzbek in Latin script only.",
            "Never output English user-facing words.",
            "Keep productName unchanged.",
            "Do not invent values.",
            "Preserve numbers, currencies, and product identifiers.",
            "If a field is empty, return null.",
          ].join(" "),
        },
        {
          role: "user",
          content: compactJson({ products }),
        },
      ],
    });

    const parsed = data as { products?: LocalizedProductPresentation[] };
    return Array.isArray(parsed.products)
      ? parsed.products
      : buildFallbackLocalizedProducts(products);
  } catch {
    return buildFallbackLocalizedProducts(products);
  }
}

export async function generateFollowUpQuestions(input: AiGenerateQuestionsBodyType) {
  const existingAnswers = input.existingAnswers.map(
    (item: AiGenerateQuestionsBodyType["existingAnswers"][number]) =>
      AiQuestionAnswerSchema.parse(item),
  );
  const existingKeys = new Set(
    existingAnswers.map((item: typeof existingAnswers[number]) => item.questionKey),
  );
  const answerMap = new Map(existingAnswers.map((item) => [item.questionKey, item.answer]));
  const needType = answerMap.get("need_type");

  try {
    const { data, model } = await ollamaChatJson<unknown>({
      format: QUESTION_RESPONSE_SCHEMA,
      messages: [
        {
          role: "system",
          content: [
            "You are a banking workflow assistant for credit experts at an Uzbek SME bank using a Telegram Mini App.",
            "The expert interviews a small/medium-business owner to match them with a banking product (credit lines, working-capital loans, equipment finance, leasing, settlement packages, POS, payroll, FX accounts).",
            "Create concise follow-up questionnaire items that fill the gaps the base intake did not cover.",
            "Return valid JSON only.",
            "Always ask 2 to 4 useful follow-up questions.",
            "Do not repeat already answered question keys. Do not repeat base question keys.",
            "Prefer select questions with 3 to 4 clear, mutually exclusive options.",
            "Use meaningful snake_case keys (e.g. monthly_revenue, years_in_business, collateral_type, currency_preference, down_payment_ready).",
            "Do not invent rates, ratios, bank policies, or eligibility rules.",
            "Every question must materially help product selection — avoid generic 'about the business' questions.",
            needType === "non_credit"
              ? "For non-credit needs, ask about monthly transaction volume, preferred currency (UZS/USD/EUR), POS terminal demand, payroll headcount, foreign payment frequency (SWIFT/CNY), settlement-package tier, and digital-banking preferences."
              : "For credit needs, ask about monthly revenue band, years in operation, business sector (trade/manufacturing/services/agriculture/construction), requested currency (UZS/USD), preferred repayment schedule (monthly/seasonal/grace period), collateral availability (real-estate/equipment/cars/pledged inventory/guarantor), down-payment readiness, existing loans at other banks, and urgency (under 7 days / 2-4 weeks / flexible).",
            "When the client is a microbusiness or sole proprietor, also ask about owner credit history and whether the business is officially registered.",
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
    const questions = parsed.questions
      .filter(
        (question: AiGenerateQuestionsResponseType["questions"][number]) =>
          !existingKeys.has(question.key),
      )
      .slice(0, input.maxQuestions)
      .map((question: AiGenerateQuestionsResponseType["questions"][number]) => ({
        ...question,
        options: question.type === "select" ? question.options.slice(0, 6) : [],
      }));

    if (questions.length >= 2) {
      return {
        questions: ensureMinimumFollowUpQuestions(questions, {
          ...input,
          existingAnswers,
        }),
        model,
      };
    }

    return {
      ...buildFallbackQuestions({
        ...input,
        existingAnswers,
      }),
      model: "fallback",
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
      messages: [
        {
          role: "system",
          content: [
            "You are a banking workflow assistant.",
            "Return valid JSON only.",
            "Never invent products, rates, policies, or eligibility rules.",
            "Use only the allowed product catalog provided by the backend.",
            "Rank at most 5 products.",
            "The explanation must be concise, natural, and entirely in the target language.",
            "Never output English user-facing text.",
            "Keep each explanation under 220 characters and no more than two short sentences.",
            "Also localize the product presentation fields into the same target language.",
            "Keep productName unchanged.",
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

    const parsed = AiRecommendProductsResponse.parse(data);
    const localizedProducts = await localizeProductPresentation(
      sanitizedProducts
        .filter((product) =>
          parsed.recommendations.some(
            (recommendation) =>
              recommendation.productId === (product.id ?? null) ||
              recommendation.productName === product.name,
          ),
        )
        .map((product) => ({
          productId: product.id ?? null,
          productName: product.name,
          segment: product.segment ?? null,
          purpose: product.purpose ?? null,
          highlight: product.highlight ?? null,
          loanAmount: product.loanAmount ?? null,
          rateSummary:
            [product.rateUZS, product.rateUSD, product.rateEUR].filter(Boolean).join(" | ") || null,
          relevantTerm:
            [product.termWorkingCapital, product.termFixedAssets, product.termUntargeted]
              .filter(Boolean)
              .join(" | ") || null,
          disbursementForm: product.disbursementForm ?? null,
          gracePeriod: null,
        })),
      input.language,
    );

    return {
      recommendations: mergeLocalizedPresentation(parsed.recommendations, localizedProducts),
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
      messages: [
        {
          role: "system",
          content: [
            "Siz bank jarayonlari bo'yicha yordamchisiz.",
            "Mijozga tayyor taklif uchun bitta qisqa va ravon xulosa yozing.",
            "Faqat mijozga ko'rinadigan matnni yozing.",
            "Inglizcha foydalanuvchi matnini chiqarmang.",
            "Ichki mulohazalar yoki mahsulot nima uchun tanlangani haqida yozmang.",
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
      think: false,
      messages: [
        {
          role: "system",
          content: [
            "You are a translation helper in a banking workflow.",
            `Translate from ${sourceLabel} to ${targetLabel}.`,
            input.targetLanguage === "uz"
              ? "Output Uzbek in Latin script only. Do not use Cyrillic. Translate the entire text into Uzbek."
              : "Output Russian in natural Cyrillic. Translate the entire text into Russian.",
            "Return JSON with one field: text.",
            "Preserve names, numbers, identifiers, VIN, plate text, passport numbers, phone numbers, and currency values.",
            "Do not add explanations, comments, or markdown.",
            retry
              ? "The previous attempt mixed languages. Rewrite the full text completely in the target language now."
              : "Translate the content faithfully and fully.",
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

  const forceTranslate = async () => {
    const { content, model } = await ollamaChatText({
      timeoutMs: 30_000,
      temperature: 0,
      think: false,
      messages: [
        {
          role: "system",
          content: [
            "You are a strict translation helper in a banking workflow.",
            `Translate from ${sourceLabel} to ${targetLabel}.`,
            input.targetLanguage === "uz"
              ? "Rewrite the entire text fully in Uzbek Latin script only."
              : "Rewrite the entire text fully in natural Russian Cyrillic only.",
            "Preserve names, numbers, identifiers, VIN, plate text, passport numbers, phone numbers, and currency values.",
            "Do not leave any sentence or phrase in the source language.",
            "Return translated text only.",
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
      text: trimMultilineText(content || ""),
    };
  };

  let translated = await translateOnce(false);
  if (shouldRetryTranslation(input.text, input.targetLanguage, translated.text)) {
    translated = await translateOnce(true);
  }
  if (shouldRetryTranslation(input.text, input.targetLanguage, translated.text)) {
    translated = await forceTranslate();
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
