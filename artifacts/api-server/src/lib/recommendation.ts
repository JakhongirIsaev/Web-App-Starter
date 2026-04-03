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

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  trade: "Savdo",
  services: "Xizmatlar",
  production: "Ishlab chiqarish",
  agriculture: "Qishloq xo'jaligi",
  other: "Boshqa",
};

const BUSINESS_SIZE_LABELS: Record<string, string> = {
  micro: "Mikro biznes",
  small: "Kichik biznes",
  medium: "O'rta biznes",
};

const NEED_TYPE_LABELS: Record<string, string> = {
  credit: "Kredit mahsuloti",
  non_credit: "Nokredit mahsulot",
  both: "Kredit va qo'shimcha bank mahsulotlari",
};

const LOAN_PURPOSE_LABELS: Record<string, string> = {
  working_capital: "Aylanma mablag'ni to'ldirish",
  fixed_assets: "Asosiy vositalarni sotib olish",
  untargeted: "Erkin maqsad",
  not_sure: "Maqsad hali aniqlanmagan",
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

function toAnswerMap(answers: QuestionnaireAnswer[] = []) {
  return new Map(answers.map((item) => [item.questionKey, item.answer]));
}

export function buildClientPreferenceProfile(answers: QuestionnaireAnswer[] = []): ClientPreferenceProfile {
  const answerMap = toAnswerMap(answers);
  const businessType = answerMap.get("business_type");
  const businessSize = answerMap.get("business_size");
  const needType = answerMap.get("need_type");
  const loanPurpose = answerMap.get("loan_purpose");
  const desiredAmount = answerMap.get("desired_amount");
  const desiredTerm = answerMap.get("desired_term");

  return {
    businessType,
    businessTypeLabel: businessType ? (BUSINESS_TYPE_LABELS[businessType] || businessType) : undefined,
    businessSize,
    businessSizeLabel: businessSize ? (BUSINESS_SIZE_LABELS[businessSize] || businessSize) : undefined,
    needType,
    needTypeLabel: needType ? (NEED_TYPE_LABELS[needType] || needType) : undefined,
    loanPurpose,
    loanPurposeLabel: loanPurpose ? (LOAN_PURPOSE_LABELS[loanPurpose] || loanPurpose) : undefined,
    desiredAmount,
    desiredTerm,
  };
}

export function summarizeClientPreferences(profile: ClientPreferenceProfile): Array<{ label: string; value: string }> {
  return [
    profile.businessTypeLabel ? { label: "Biznes turi", value: profile.businessTypeLabel } : null,
    profile.businessSizeLabel ? { label: "Biznes hajmi", value: profile.businessSizeLabel } : null,
    profile.needTypeLabel ? { label: "Ehtiyoj turi", value: profile.needTypeLabel } : null,
    profile.loanPurposeLabel ? { label: "Maqsad", value: profile.loanPurposeLabel } : null,
    profile.desiredAmount ? { label: "Kerakli summa", value: profile.desiredAmount } : null,
    profile.desiredTerm ? { label: "Kerakli muddat", value: `${profile.desiredTerm} oy` } : null,
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

export function buildRecommendationNote(product: ProductLike, profile: ClientPreferenceProfile): string {
  const reasons: string[] = [];

  if (profile.needTypeLabel) {
    reasons.push(`Mijozning asosiy ehtiyoji ${profile.needTypeLabel.toLowerCase()} bo'lgani uchun ushbu mahsulot tanlandi.`);
  }

  if (profile.businessSizeLabel && product.segment) {
    reasons.push(`Mahsulot segmenti ${product.segment} bo'lib, u ${profile.businessSizeLabel.toLowerCase()} uchun mos keladi.`);
  }

  if (profile.loanPurposeLabel && productMatchesPurpose(product, profile.loanPurpose)) {
    reasons.push(`Mahsulotning asosiy yo'nalishi ${profile.loanPurposeLabel.toLowerCase()} ehtiyojiga mos keladi.`);
  }

  if (profile.desiredAmount && product.loanAmount) {
    reasons.push(`Kerakli summa bank mahsuloti limitlari bilan solishtirilganda mos diapazonga tushadi.`);
  }

  if (profile.desiredTerm && getRelevantTerm(product, profile.loanPurpose)) {
    reasons.push(`So'ralgan muddat mavjud mahsulot shartlari bilan qoplanadi.`);
  }

  if (product.disbursementForm) {
    reasons.push(`Ajratish shakli: ${product.disbursementForm}.`);
  }

  if (product.highlight) {
    reasons.push(`Mahsulot afzalligi: ${product.highlight}.`);
  }

  if (reasons.length === 0) {
    reasons.push("Mahsulot mijozning anketa javoblari va ekspert tanlovi asosida savatga qo'shildi.");
  }

  return reasons.join(" ");
}
