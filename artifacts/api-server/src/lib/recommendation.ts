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
  trade: { uz: "Savdo", ru: "Торговля" },
  services: { uz: "Xizmatlar", ru: "Услуги" },
  production: { uz: "Ishlab chiqarish", ru: "Производство" },
  agriculture: { uz: "Qishloq xo'jaligi", ru: "Сельское хозяйство" },
  other: { uz: "Boshqa", ru: "Другое" },
};

const BUSINESS_SIZE_LABELS = {
  micro: { uz: "Mikro biznes", ru: "Микробизнес" },
  small: { uz: "Kichik biznes", ru: "Малый бизнес" },
  medium: { uz: "O'rta biznes", ru: "Средний бизнес" },
};

const NEED_TYPE_LABELS = {
  credit: { uz: "Kredit mahsuloti", ru: "Кредитный продукт" },
  non_credit: { uz: "Nokredit mahsulot", ru: "Некредитный продукт" },
  both: {
    uz: "Kredit va qo'shimcha bank mahsulotlari",
    ru: "Кредит и дополнительные банковские продукты",
  },
};

const LOAN_PURPOSE_LABELS = {
  working_capital: {
    uz: "Aylanma mablag'ni to'ldirish",
    ru: "Пополнение оборотных средств",
  },
  fixed_assets: {
    uz: "Asosiy vositalarni sotib olish",
    ru: "Приобретение основных средств",
  },
  untargeted: { uz: "Erkin maqsad", ru: "Свободная цель" },
  not_sure: { uz: "Maqsad hali aniqlanmagan", ru: "Цель пока не определена" },
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
  preferredCurrency?: string;
  preferredCurrencyLabel?: string;
  monthlyPaymentComfort?: string;
  monthlyPaymentComfortLabel?: string;
  repaymentPreference?: string;
  repaymentPreferenceLabel?: string;
  downPaymentLevel?: string;
  downPaymentLevelLabel?: string;
  needsGracePeriod?: string;
  needsGracePeriodLabel?: string;
}

type SupportedLanguage = "ru" | "uz";

const CURRENCY_LABELS = {
  uzs: { uz: "So'm", ru: "Сум" },
  usd: { uz: "AQSh dollari", ru: "Доллар США" },
  eur: { uz: "Yevro", ru: "Евро" },
  not_sure: { uz: "Hali aniqlanmagan", ru: "Пока не определено" },
};

const MONTHLY_PAYMENT_LABELS = {
  up_to_10m: { uz: "10 mln so'mgacha", ru: "До 10 млн сум" },
  "10m_to_30m": { uz: "10-30 mln so'm", ru: "10-30 млн сум" },
  over_30m: { uz: "30 mln so'mdan yuqori", ru: "Свыше 30 млн сум" },
  not_sure: { uz: "Hali aniq emas", ru: "Пока неясно" },
};

const REPAYMENT_PREFERENCE_LABELS = {
  annuity: { uz: "Har oy bir xil to'lov", ru: "Равный платеж каждый месяц" },
  differentiated: { uz: "Boshlanishida katta, keyin kamayadigan", ru: "Сначала выше, затем меньше" },
  not_sure: { uz: "Ekspert tavsiya bersin", ru: "Пусть эксперт подскажет" },
};

const DOWN_PAYMENT_LABELS = {
  none: { uz: "Boshlang'ich to'lovsiz", ru: "Без первоначального взноса" },
  up_to_20: { uz: "20% gacha", ru: "До 20%" },
  "20_to_40": { uz: "20-40%", ru: "20-40%" },
  over_40: { uz: "40% dan yuqori", ru: "Свыше 40%" },
};

const GRACE_PERIOD_LABELS = {
  yes: { uz: "Ha", ru: "Да" },
  no: { uz: "Yo'q", ru: "Нет" },
  not_sure: { uz: "Hali aniqlanmagan", ru: "Пока не определено" },
};

function toAnswerMap(answers: QuestionnaireAnswer[] = []) {
  return new Map(answers.map((item) => [item.questionKey, item.answer]));
}

function getLabel(
  labels: Record<string, { uz: string; ru: string }>,
  value: string | undefined,
  language: SupportedLanguage,
) {
  if (!value) return undefined;
  const candidate = labels[value];
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
  const preferredCurrency = answerMap.get("preferred_currency");
  const monthlyPaymentComfort = answerMap.get("monthly_payment_comfort");
  const repaymentPreference = answerMap.get("repayment_preference");
  const downPaymentLevel = answerMap.get("down_payment_level");
  const needsGracePeriod = answerMap.get("needs_grace_period");

  return {
    businessType,
    businessTypeLabel: getLabel(BUSINESS_TYPE_LABELS, businessType, language),
    businessSize,
    businessSizeLabel: getLabel(BUSINESS_SIZE_LABELS, businessSize, language),
    needType,
    needTypeLabel: getLabel(NEED_TYPE_LABELS, needType, language),
    loanPurpose,
    loanPurposeLabel: getLabel(LOAN_PURPOSE_LABELS, loanPurpose, language),
    desiredAmount,
    desiredTerm,
    preferredCurrency,
    preferredCurrencyLabel: getLabel(CURRENCY_LABELS, preferredCurrency, language),
    monthlyPaymentComfort,
    monthlyPaymentComfortLabel: getLabel(MONTHLY_PAYMENT_LABELS, monthlyPaymentComfort, language),
    repaymentPreference,
    repaymentPreferenceLabel: getLabel(REPAYMENT_PREFERENCE_LABELS, repaymentPreference, language),
    downPaymentLevel,
    downPaymentLevelLabel: getLabel(DOWN_PAYMENT_LABELS, downPaymentLevel, language),
    needsGracePeriod,
    needsGracePeriodLabel: getLabel(GRACE_PERIOD_LABELS, needsGracePeriod, language),
  };
}

export function summarizeClientPreferences(
  profile: ClientPreferenceProfile,
  language: SupportedLanguage = "uz",
): Array<{ label: string; value: string }> {
  const labels = {
    businessType: language === "ru" ? "Тип бизнеса" : "Biznes turi",
    businessSize: language === "ru" ? "Размер бизнеса" : "Biznes hajmi",
    needType: language === "ru" ? "Тип потребности" : "Ehtiyoj turi",
    purpose: language === "ru" ? "Цель" : "Maqsad",
    amount: language === "ru" ? "Нужная сумма" : "Kerakli summa",
    term: language === "ru" ? "Нужный срок" : "Kerakli muddat",
    currency: language === "ru" ? "Валюта" : "Valyuta",
    monthlyPayment: language === "ru" ? "Комфортный ежемесячный платеж" : "Qulay oylik to'lov",
    repayment: language === "ru" ? "Предпочтительный график" : "Afzal to'lov jadvali",
    downPayment: language === "ru" ? "Первоначальный взнос" : "Boshlang'ich to'lov",
    gracePeriod: language === "ru" ? "Нужен льготный период" : "Imtiyozli davr kerak",
    months: language === "ru" ? "мес." : "oy",
  };

  return [
    profile.businessTypeLabel ? { label: labels.businessType, value: profile.businessTypeLabel } : null,
    profile.businessSizeLabel ? { label: labels.businessSize, value: profile.businessSizeLabel } : null,
    profile.needTypeLabel ? { label: labels.needType, value: profile.needTypeLabel } : null,
    profile.loanPurposeLabel ? { label: labels.purpose, value: profile.loanPurposeLabel } : null,
    profile.desiredAmount ? { label: labels.amount, value: profile.desiredAmount } : null,
    profile.desiredTerm ? { label: labels.term, value: `${profile.desiredTerm} ${labels.months}` } : null,
    profile.preferredCurrencyLabel ? { label: labels.currency, value: profile.preferredCurrencyLabel } : null,
    profile.monthlyPaymentComfortLabel ? { label: labels.monthlyPayment, value: profile.monthlyPaymentComfortLabel } : null,
    profile.repaymentPreferenceLabel ? { label: labels.repayment, value: profile.repaymentPreferenceLabel } : null,
    profile.downPaymentLevelLabel ? { label: labels.downPayment, value: profile.downPaymentLevelLabel } : null,
    profile.needsGracePeriodLabel ? { label: labels.gracePeriod, value: profile.needsGracePeriodLabel } : null,
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

export function isCreditNeedType(needType?: string) {
  return !needType || needType === "credit" || needType === "both";
}

export function isNonCreditNeedType(needType?: string) {
  return needType === "non_credit" || needType === "both";
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
