export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface QuestionnaireResponse {
  question: string;
  type: "select" | "input";
  options?: Array<{ value: string; label: string }>;
  key: string;
  done: boolean;
  summary?: Record<string, unknown>;
}

export interface RecommendationFactsResponse {
  clientProfile: string;
  whyRecommended: string[];
  riskNotes: string[];
  tips: string[];
}

export interface PdfSummaryResponse {
  aiSummary: string;
  keyHighlights: string[];
}

const START_PROMPT = "Начните анкетирование. Задайте первый вопрос.";

const QUESTIONNAIRE_STEPS: Array<Omit<QuestionnaireResponse, "done">> = [
  {
    key: "client_type",
    question: "Клиент является физическим лицом или юридическим лицом?",
    type: "select",
    options: [
      { value: "individual", label: "Физлицо" },
      { value: "legal", label: "Юрлицо" },
    ],
  },
  {
    key: "business_type",
    question: "Какой тип бизнеса у клиента?",
    type: "select",
    options: [
      { value: "trade", label: "Торговля" },
      { value: "services", label: "Услуги" },
      { value: "production", label: "Производство" },
      { value: "agriculture", label: "Сельское хозяйство" },
      { value: "other", label: "Другое" },
    ],
  },
  {
    key: "business_size",
    question: "Какой размер бизнеса у клиента?",
    type: "select",
    options: [
      { value: "micro", label: "Микро" },
      { value: "small", label: "Малый" },
      { value: "medium", label: "Средний" },
    ],
  },
  {
    key: "need_type",
    question: "Что нужно клиенту: кредит, некредитный продукт или оба варианта?",
    type: "select",
    options: [
      { value: "credit", label: "Кредит" },
      { value: "non_credit", label: "Некредитный продукт" },
      { value: "both", label: "И то и другое" },
    ],
  },
  {
    key: "loan_purpose",
    question: "На что планируется финансирование?",
    type: "select",
    options: [
      { value: "working_capital", label: "Пополнение оборотных средств" },
      { value: "fixed_assets", label: "Приобретение основных средств" },
      { value: "untargeted", label: "Нецелевое использование" },
      { value: "not_sure", label: "Пока не определено" },
    ],
  },
  {
    key: "desired_amount",
    question: "Какую сумму клиент хочет рассмотреть?",
    type: "input",
  },
  {
    key: "desired_term",
    question: "На какой срок нужен продукт?",
    type: "input",
  },
  {
    key: "business_location",
    question: "Где находится бизнес клиента? Укажите город или локацию.",
    type: "input",
  },
  {
    key: "collateral",
    question: "Есть ли залог или другое обеспечение?",
    type: "select",
    options: [
      { value: "yes", label: "Да, есть" },
      { value: "partial", label: "Частично" },
      { value: "no", label: "Нет" },
      { value: "need_help", label: "Нужно уточнить" },
    ],
  },
  {
    key: "credit_history",
    question: "Есть ли действующие кредиты или просрочки?",
    type: "select",
    options: [
      { value: "clean", label: "Без просрочек" },
      { value: "active_loans", label: "Есть действующие кредиты" },
      { value: "overdue", label: "Есть просрочки" },
      { value: "not_sure", label: "Пока не знаю" },
    ],
  },
];

function extractJson(content: string): Record<string, unknown> | null {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function extractQuestionnaireResponses(messages: ConversationMessage[]): Array<{ key: string; answer: string }> {
  const responses: Array<{ key: string; answer: string }> = [];
  let lastKey = "";

  for (const message of messages) {
    if (message.role === "assistant") {
      const parsed = extractJson(message.content);
      if (parsed?.key && typeof parsed.key === "string") {
        lastKey = parsed.key;
      }
      continue;
    }

    if (message.role === "user" && lastKey && message.content !== START_PROMPT) {
      responses.push({ key: lastKey, answer: message.content.trim() });
      lastKey = "";
    }
  }

  return responses;
}

function toNumber(value: string): number | null {
  const digits = value.replace(/[^\d.,-]/g, "").replace(",", ".");
  if (!digits) return null;
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function labelForChoice(key: string, value: string): string {
  const choiceMap: Record<string, Record<string, string>> = {
    client_type: {
      individual: "Физлицо",
      legal: "Юрлицо",
    },
    business_type: {
      trade: "Торговля",
      services: "Услуги",
      production: "Производство",
      agriculture: "Сельское хозяйство",
      other: "Другое",
    },
    business_size: {
      micro: "Микро",
      small: "Малый",
      medium: "Средний",
    },
    need_type: {
      credit: "Кредит",
      non_credit: "Некредитный продукт",
      both: "И то и другое",
    },
    loan_purpose: {
      working_capital: "Пополнение оборотных средств",
      fixed_assets: "Приобретение основных средств",
      untargeted: "Нецелевое использование",
      not_sure: "Пока не определено",
    },
    collateral: {
      yes: "Да, есть",
      partial: "Частично",
      no: "Нет",
      need_help: "Нужно уточнить",
    },
    credit_history: {
      clean: "Без просрочек",
      active_loans: "Есть действующие кредиты",
      overdue: "Есть просрочки",
      not_sure: "Пока не знаю",
    },
  };

  return choiceMap[key]?.[value] || value;
}

function buildQuestionnaireSummary(responses: Array<{ key: string; answer: string }>): Record<string, unknown> {
  const answerMap = new Map(responses.map((item) => [item.key, item.answer]));
  const clientType = answerMap.get("client_type") || "";
  const businessType = answerMap.get("business_type") || "";
  const businessSize = answerMap.get("business_size") || "";
  const needType = answerMap.get("need_type") || "";
  const loanPurpose = answerMap.get("loan_purpose") || "";
  const desiredAmount = answerMap.get("desired_amount") || "";
  const desiredTerm = answerMap.get("desired_term") || "";
  const businessLocation = answerMap.get("business_location") || "";
  const collateral = answerMap.get("collateral") || "";
  const creditHistory = answerMap.get("credit_history") || "";

  const amountValue = desiredAmount ? toNumber(desiredAmount) : null;
  const riskFactors: string[] = [];

  if (!collateral || collateral === "no" || collateral === "need_help") {
    riskFactors.push("Залог не подтверждён");
  }
  if (amountValue && amountValue >= 500_000_000) {
    riskFactors.push("Крупная сумма требует дополнительной проверки");
  }
  if (creditHistory === "overdue") {
    riskFactors.push("Есть просрочки по кредитной истории");
  }
  if (riskFactors.length === 0) {
    riskFactors.push("По анкете существенных рисков не выявлено");
  }

  const badges = [
    businessSize ? `${labelForChoice("business_size", businessSize)} бизнес` : "Бизнес подтверждён",
    needType ? `Запрос: ${labelForChoice("need_type", needType)}` : "Запрос уточняется",
  ];

  if (collateral === "yes") badges.push("Залог подтверждён");
  if (creditHistory === "clean") badges.push("Хорошая кредитная история");

  return {
    clientType: labelForChoice("client_type", clientType),
    businessType: labelForChoice("business_type", businessType),
    businessSize: labelForChoice("business_size", businessSize),
    needType: labelForChoice("need_type", needType),
    loanPurpose: labelForChoice("loan_purpose", loanPurpose),
    desiredAmount: amountValue !== null ? amountValue.toLocaleString("ru-RU") : desiredAmount,
    desiredTerm: desiredTerm ? `${desiredTerm} мес.` : "",
    businessLocation,
    collateral: labelForChoice("collateral", collateral),
    creditHistory: labelForChoice("credit_history", creditHistory),
    riskFactors,
    badges,
    nextSteps: [
      "Проверить пакет документов",
      "Сверить платёжеспособность клиента",
      "Подобрать 2-3 подходящих продукта",
    ],
    fitScore: Math.max(50, 92 - riskFactors.length * 8),
  };
}

export function buildQuestionnaireFallback(messages: ConversationMessage[]): QuestionnaireResponse {
  const responses = extractQuestionnaireResponses(messages);
  const nextStep = QUESTIONNAIRE_STEPS[responses.length];

  if (nextStep) {
    return {
      ...nextStep,
      done: false,
    };
  }

  return {
    question: "Анкета завершена. Данные собраны для подбора продуктов.",
    type: "input",
    key: "questionnaire_complete",
    done: true,
    summary: buildQuestionnaireSummary(responses),
  };
}

export function buildRecommendationFactsFallback(
  answers: Array<{ questionKey: string; answer: string }> | undefined,
  recommendedProducts: Array<{ name?: string; segment?: string; purpose?: string }> | undefined,
): RecommendationFactsResponse {
  const map = new Map((answers || []).map((item) => [item.questionKey, item.answer]));
  const productNames = (recommendedProducts || [])
    .map((product) => product.name)
    .filter(Boolean)
    .slice(0, 3);

  const clientBits = [
    map.get("business_size") ? `бизнес ${labelForChoice("business_size", map.get("business_size") || "")}` : "данные по бизнесу частично заполнены",
    map.get("business_type") ? labelForChoice("business_type", map.get("business_type") || "") : "тип бизнеса не уточнён",
  ];

  const whyRecommended = [
    recommendedProducts && recommendedProducts.length
      ? `Подобрано ${recommendedProducts.length} продуктов по заполненной анкете.`
      : "Список рекомендаций сформирован по доступным условиям продуктов.",
  ];

  if (productNames.length > 0) {
    whyRecommended.push(`В списке есть: ${productNames.join(", ")}.`);
  }

  const riskNotes: string[] = [];
  const creditHistory = map.get("credit_history") || "";
  const collateral = map.get("collateral") || "";
  const amountValue = map.get("desired_amount") ? toNumber(map.get("desired_amount") || "") : null;

  if (collateral === "no" || collateral === "need_help") {
    riskNotes.push("Залог не подтверждён, требуется дополнительная проверка.");
  }
  if (creditHistory === "overdue") {
    riskNotes.push("Есть просрочки, стоит проверить кредитную историю.");
  }
  if (amountValue && amountValue >= 500_000_000) {
    riskNotes.push("Крупная сумма может потребовать расширенный пакет документов.");
  }
  if (riskNotes.length === 0) {
    riskNotes.push("Существенных рисков по анкете не выявлено.");
  }

  const tips = [
    "Сравните не менее двух подходящих продуктов перед выбором.",
    "Уточните пакет документов и наличие обеспечения.",
    "Проверьте, укладывается ли срок продукта в потребность клиента.",
  ];

  return {
    clientProfile: `Клиент: ${clientBits.join(" · ")}.`,
    whyRecommended,
    riskNotes,
    tips,
  };
}

export function buildPdfSummaryFallback(
  client: { fullName?: string | null; phone?: string | null; tin?: string | null; badges?: string[] | null },
  basketItems: Array<{ productName?: string }> | undefined,
  calculations: Array<{
    productName?: string;
    monthlyPayment?: string | null;
    totalPayment?: string | null;
    totalInterest?: string | null;
    currency?: string;
    interestRate?: string;
    termMonths?: number;
  }> | undefined,
): PdfSummaryResponse {
  const products = (basketItems || [])
    .map((item) => item.productName)
    .filter(Boolean);
  const latestCalc = (calculations || [])[0];

  const summaryParts = [
    client.fullName ? `Клиент ${client.fullName}` : "Профиль клиента сформирован",
    products.length ? `в корзине ${products.slice(0, 3).join(", ")}` : "корзина ещё не заполнена",
  ];

  if (latestCalc?.monthlyPayment) {
    summaryParts.push(`ежемесячный платёж по последнему расчёту ${latestCalc.monthlyPayment} ${latestCalc.currency || ""}`.trim());
  }

  const keyHighlights: string[] = [];
  if (client.tin) keyHighlights.push("ИНН/СТИР добавлен в карточку клиента");
  if (client.badges && client.badges.length > 0) keyHighlights.push(`Метки: ${client.badges.slice(0, 3).join(", ")}`);
  if (products.length > 0) keyHighlights.push(`Подобрано ${products.length} продуктов`);
  if (latestCalc?.totalPayment) {
    keyHighlights.push(`Общая сумма выплат: ${latestCalc.totalPayment} ${latestCalc.currency || ""}`.trim());
  }
  if (keyHighlights.length === 0) {
    keyHighlights.push("Подготовлен базовый профиль для коммерческого предложения");
  }

  return {
    aiSummary: `${summaryParts.join(", ")}.`,
    keyHighlights,
  };
}
