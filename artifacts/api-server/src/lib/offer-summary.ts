// Deterministic offer-summary template (replaces the legacy AI offer-summary call).
// Phase B1.3: see docs/PHASE_B_PLAN.md.

import { formatUzs } from "./money";

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
    `Сумма: ${formatUzs(vars.amountUzs, { withSymbol: true })}, ` +
    `срок: ${vars.termMonths} мес., ` +
    `ставка: ${(vars.rateUzs * 100).toFixed(1)}%.`,
  uz: (vars: OfferSummaryVars) =>
    `Hurmatli ${vars.clientName}, "${vars.productName}" mahsulotimiz bo'yicha taklifimizni ko'rib chiqing. ` +
    `Summa: ${formatUzs(vars.amountUzs, { withSymbol: true })}, ` +
    `muddat: ${vars.termMonths} oy, ` +
    `stavka: ${(vars.rateUzs * 100).toFixed(1)}%.`,
} as const;

export function renderOfferSummary(vars: OfferSummaryVars, language: "ru" | "uz"): string {
  return TEMPLATES[language](vars);
}
