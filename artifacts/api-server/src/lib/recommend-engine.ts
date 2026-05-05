import type { PolicyParams } from "./policy-params";

export interface ProductLike {
  id: number;
  segment: "micro" | "small" | "medium";
  currency: "UZS" | "USD" | "EUR" | "RUB";
  purpose: string;
  minRate: number;        // 0-1 (e.g. 0.24 = 24%)
  maxRate: number;
  maxTermMonths: number;
}

export interface ClientIntent {
  segment: "micro" | "small" | "medium";
  currency: "UZS" | "USD" | "EUR" | "RUB";
  purpose: string;
  desiredAmountUzs: number;
  desiredTermMonths: number;
}

export interface RecommendInput {
  products: ProductLike[];
  params: PolicyParams;
  client: ClientIntent;
}

function purposeCategory(purpose: string): "workingCapital" | "fixedAssets" {
  if (/equipment|vehicle|real_estate|fixed/i.test(purpose)) return "fixedAssets";
  return "workingCapital";
}

function minRequiredRate(params: PolicyParams, client: ClientIntent): number {
  const isFx = client.currency !== "UZS";
  if (isFx) return params.minRatesFx[client.segment];
  if (client.segment === "medium") return params.minRatesUzs.medium.any;
  return client.desiredTermMonths <= 12
    ? params.minRatesUzs[client.segment].le12m
    : params.minRatesUzs[client.segment].gt12m;
}

export function recommendProducts(input: RecommendInput): ProductLike[] {
  const { products, params, client } = input;

  // Hard reject: negative industries (substring match, case-insensitive)
  const purposeLower = client.purpose.toLowerCase();
  if (params.negativeIndustryKeywords.some((kw) => purposeLower.includes(kw.toLowerCase()))) {
    return [];
  }

  const requiredRate = minRequiredRate(params, client);
  const segmentTermCap = params.maxTermMonths[purposeCategory(client.purpose)];

  return products
    .filter((p) => p.segment === client.segment)
    .filter((p) => p.currency === client.currency)
    .filter((p) => p.purpose === client.purpose)
    .filter((p) => p.minRate >= requiredRate)
    .filter((p) => client.desiredTermMonths <= Math.min(p.maxTermMonths, segmentTermCap))
    .sort((a, b) => a.minRate - b.minRate);
}
