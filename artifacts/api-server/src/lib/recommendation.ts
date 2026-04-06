export interface QuestionnaireAnswer {
  questionKey: string;
  answer: string;
}

export interface ProductLike {
  name: string;
  sapCode?: string | null;
  segment?: string | null;
  disbursementForm?: string | null;
  loanAmount?: string | null;
  termWorkingCapital?: string | null;
  termFixedAssets?: string | null;
  termUntargeted?: string | null;
  rateUZS?: string | null;
  rateUSD?: string | null;
  rateEUR?: string | null;
  gracePeriod?: string | null;
  purpose?: string | null;
  highlight?: string | null;
}

const BUSINESS_TYPE_LABELS = {
  trade: { uz: "Savdo", ru: "Торговля", en: "Trade" },
  services: { uz: "Xizmatlar", ru: "Услуги", en: "Services" },
  production: { uz: "Ishlab chiqarish", ru: "Производство", en: "Production" },
  agriculture: { uz: "Qishloq xo'jaligi", ru: "Сельское хозяйство", en: "Agriculture" },
  other: { uz: "Boshqa", ru: "Другое", en: "Other" },
};

const BUSINESS_SIZE_LABELS = {
  micro: { uz: "Mikro biznes", ru: "Микробизнес", en: "Micro business" },
  small: { uz: "Kichik biznes", ru: "Малый бизнес", en: "Small business" },
  medium: { uz: "O'rta biznes", ru: "Средний бизнес", en: "Medium business" },
};

const NEED_TYPE_LABELS = {
  credit: { uz: "Kredit mahsuloti", ru: "Кредитный продукт", en: "Credit product" },
  non_credit: { uz: "Nokredit mahsulot", ru: "Некредитный продукт", en: "Non-credit product" },
  both: {
    uz: "Kredit va qo'shimcha bank mahsulotlari",
    ru: "Кредит и дополнительные банковские продукты",
    en: "Credit and additional banking products",
  },
};

const LOAN_PURPOSE_LABELS = {
  working_capital: {
    uz: "Aylanma mablag'ni to'ldirish",
    ru: "Пополнение оборотных средств",
    en: "Working capital",
  },
  fixed_assets: {
    uz: "Asosiy vositalarni sotib olish",
    ru: "Приобретение основных средств",
    en: "Fixed assets",
  },
  untargeted: { uz: "Erkin maqsad", ru: "Свободная цель", en: "Untargeted use" },
  not_sure: { uz: "Maqsad hali aniqlanmagan", ru: "Цель пока не определена", en: "Purpose not decided yet" },
};

export interface ClientPreferenceProfile {
  businessType?: string;
  businessTypeLabel?: string;
  businessSize?: string;
  businessSizeLabel?: string;
  needType?: string;
  needTypeLabel?: string;
  loanPurpose?: string;
  loanPurposeLabel?: string;
  desiredAmount?: string;
  desiredTerm?: string;
}

type SupportedLanguage = "ru" | "uz" | "en";

function toAnswerMap(answers: QuestionnaireAnswer[] = []) {
  return new Map(answers.map((item) => [item.questionKey, item.answer]));
}

function getLabel<T extends string>(
  labels: Record<T, { uz: string; ru: string; en: string }>,
  value: string | undefined,
  language: SupportedLanguage,
) {
  if (!value) return undefined;
  const candidate = labels[value as T];
  return candidate ? candidate[language] : value;
}

export function buildClientPreferenceProfile(
  answers: QuestionnaireAnswer[] = [],
  language: SupportedLanguage = "uz",
): ClientPreferenceProfile {
  const answerMap = toAnswerMap(answers);
  const businessType = answerMap.get("business_type");
  const businessSize = answerMap.get("business_size");
  const needType = answerMap.get("need_type");
  const loanPurpose = answerMap.get("loan_purpose");
  const desiredAmount = answerMap.get("desired_amount");
  const desiredTerm = answerMap.get("desired_term");

  return {
    businessType,
    businessTypeLabel: getLabel(BUSINESS_TYPE_LABELS as any, businessType, language),
    businessSize,
    businessSizeLabel: getLabel(BUSINESS_SIZE_LABELS as any, businessSize, language),
    needType,
    needTypeLabel: getLabel(NEED_TYPE_LABELS as any, needType, language),
    loanPurpose,
    loanPurposeLabel: getLabel(LOAN_PURPOSE_LABELS as any, loanPurpose, language),
    desiredAmount,
    desiredTerm,
  };
}

export function summarizeClientPreferences(
  profile: ClientPreferenceProfile,
  language: SupportedLanguage = "uz",
): Array<{ label: string; value: string }> {
  const labels = {
    businessType: language === "ru" ? "Тип бизнеса" : language === "en" ? "Business type" : "Biznes turi",
    businessSize: language === "ru" ? "Размер бизнеса" : language === "en" ? "Business size" : "Biznes hajmi",
    needType: language === "ru" ? "Тип потребности" : language === "en" ? "Need type" : "Ehtiyoj turi",
    purpose: language === "ru" ? "Цель" : language === "en" ? "Purpose" : "Maqsad",
    amount: language === "ru" ? "Нужная сумма" : language === "en" ? "Requested amount" : "Kerakli summa",
    term: language === "ru" ? "Нужный срок" : language === "en" ? "Requested term" : "Kerakli muddat",
    months: language === "ru" ? "мес." : language === "en" ? "months" : "oy",
  };

  return [
    profile.businessTypeLabel ? { label: labels.businessType, value: profile.businessTypeLabel } : null,
    profile.businessSizeLabel ? { label: labels.businessSize, value: profile.businessSizeLabel } : null,
    profile.needTypeLabel ? { label: labels.needType, value: profile.needTypeLabel } : null,
    profile.loanPurposeLabel ? { label: labels.purpose, value: profile.loanPurposeLabel } : null,
    profile.desiredAmount ? { label: labels.amount, value: profile.desiredAmount } : null,
    profile.desiredTerm ? { label: labels.term, value: `${profile.desiredTerm} ${labels.months}` } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));
}

function productMatchesPurpose(product: ProductLike, loanPurpose?: string) {
  if (!loanPurpose || loanPurpose === "not_sure") return false;
  if (loanPurpose === "working_capital") return Boolean(product.termWorkingCapital);
  if (loanPurpose === "fixed_assets") return Boolean(product.termFixedAssets);
  if (loanPurpose === "untargeted") return Boolean(product.termUntargeted);
  return false;
}

export function getRelevantTerm(product: ProductLike, loanPurpose?: string): string | null {
  if (loanPurpose === "working_capital" && product.termWorkingCapital) return product.termWorkingCapital;
  if (loanPurpose === "fixed_assets" && product.termFixedAssets) return product.termFixedAssets;
  if (loanPurpose === "untargeted" && product.termUntargeted) return product.termUntargeted;
  return product.termWorkingCapital || product.termFixedAssets || product.termUntargeted || null;
}

export function getRateSummary(product: ProductLike): string | null {
  const rates = [
    product.rateUZS ? `UZS: ${product.rateUZS}` : null,
    product.rateUSD ? `USD: ${product.rateUSD}` : null,
    product.rateEUR ? `EUR: ${product.rateEUR}` : null,
  ].filter(Boolean);

  return rates.length > 0 ? rates.join(" | ") : null;
}

export function buildRecommendationNote(
  product: ProductLike,
  profile: ClientPreferenceProfile,
  language: SupportedLanguage = "uz",
): string {
  const reasons: string[] = [];

  const templates = {
    uz: {
      need: (value: string) => `Mijozning asosiy ehtiyoji ${value.toLowerCase()} bo'lgani uchun ushbu mahsulot tanlandi.`,
      segment: (segment: string, size: string) => `Mahsulot segmenti ${segment} bo'lib, u ${size.toLowerCase()} uchun mos keladi.`,
      purpose: (value: string) => `Mahsulotning asosiy yo'nalishi ${value.toLowerCase()} ehtiyojiga mos keladi.`,
      amount: "Kerakli summa bank mahsuloti limitlari bilan solishtirilganda mos diapazonga tushadi.",
      term: "So'ralgan muddat mavjud mahsulot shartlari bilan qoplanadi.",
      disbursement: (value: string) => `Ajratish shakli: ${value}.`,
      highlight: (value: string) => `Mahsulot afzalligi: ${value}.`,
      fallback: "Mahsulot mijozning anketa javoblari va ekspert tanlovi asosida savatga qo'shildi.",
    },
    ru: {
      need: (value: string) => `Продукт выбран, потому что основная потребность клиента — ${value.toLowerCase()}.`,
      segment: (segment: string, size: string) => `Сегмент продукта — ${segment}, что подходит для клиента категории ${size.toLowerCase()}.`,
      purpose: (value: string) => `Основное назначение продукта соответствует цели клиента: ${value.toLowerCase()}.`,
      amount: "Запрошенная сумма укладывается в допустимый диапазон по продукту.",
      term: "Желаемый срок покрывается текущими условиями продукта.",
      disbursement: (value: string) => `Форма выдачи: ${value}.`,
      highlight: (value: string) => `Ключевое преимущество: ${value}.`,
      fallback: "Продукт добавлен на основе анкеты клиента и выбора эксперта.",
    },
    en: {
      need: (value: string) => `The product was selected because the client's primary need is ${value.toLowerCase()}.`,
      segment: (segment: string, size: string) => `The product segment is ${segment}, which fits a ${size.toLowerCase()} client.`,
      purpose: (value: string) => `The product focus matches the client's goal: ${value.toLowerCase()}.`,
      amount: "The requested amount fits the product limits.",
      term: "The requested term is covered by the current product terms.",
      disbursement: (value: string) => `Disbursement format: ${value}.`,
      highlight: (value: string) => `Key advantage: ${value}.`,
      fallback: "The product was added based on the client questionnaire and expert choice.",
    },
  }[language];

  if (profile.needTypeLabel) {
    reasons.push(templates.need(profile.needTypeLabel));
  }

  if (profile.businessSizeLabel && product.segment) {
    reasons.push(templates.segment(product.segment, profile.businessSizeLabel));
  }

  if (profile.loanPurposeLabel && productMatchesPurpose(product, profile.loanPurpose)) {
    reasons.push(templates.purpose(profile.loanPurposeLabel));
  }

  if (profile.desiredAmount && product.loanAmount) {
    reasons.push(templates.amount);
  }

  if (profile.desiredTerm && getRelevantTerm(product, profile.loanPurpose)) {
    reasons.push(templates.term);
  }

  if (product.disbursementForm) {
    reasons.push(templates.disbursement(product.disbursementForm));
  }

  if (product.highlight) {
    reasons.push(templates.highlight(product.highlight));
  }

  if (reasons.length === 0) {
    reasons.push(templates.fallback);
  }

  return reasons.join(" ");
}
