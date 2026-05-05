// Deterministic offer-summary template (replaces /ai/generate-offer-summary AI call).
// Phase B1.3: see docs/PHASE_B_PLAN.md.

export interface OfferSummaryVars {
  clientName: string;
  productName: string;
  amountUzs: number;
  rateUzs: number;
  termMonths: number;
}

const TEMPLATES = {
  ru: (vars: OfferSummaryVars) =>
    `Уважаемый(ая) ${vars.clientName}, рассмотрите наше предложение по продукту "${vars.productName}". ` +
    `Сумма: ${vars.amountUzs.toLocaleString("ru-RU")} UZS, ` +
    `срок: ${vars.termMonths} мес., ` +
    `ставка: ${(vars.rateUzs * 100).toFixed(1)}%.`,
  uz: (vars: OfferSummaryVars) =>
    `Hurmatli ${vars.clientName}, "${vars.productName}" mahsulotimiz bo'yicha taklifimizni ko'rib chiqing. ` +
    `Summa: ${vars.amountUzs.toLocaleString("ru-RU")} UZS, ` +
    `muddat: ${vars.termMonths} oy, ` +
    `stavka: ${(vars.rateUzs * 100).toFixed(1)}%.`,
} as const;

export function renderOfferSummary(vars: OfferSummaryVars, language: "ru" | "uz"): string {
  return TEMPLATES[language](vars);
}
