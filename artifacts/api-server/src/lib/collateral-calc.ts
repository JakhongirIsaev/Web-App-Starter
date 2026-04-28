import type { CollateralResultStatus, CollateralTypeCode } from "@workspace/db";

// Pure, side-effect-free helpers for the collateral feature. No DB, no IO,
// no globals. Routes load the inputs (settings, items) and pass them in.

export interface CollateralSettings {
  coverageRatio: number;
  transportAgeThreshold: number;
  transportAgeDiscount: number;
}

export interface AcceptedValueInput {
  marketValue: number | string;
  typeCode: CollateralTypeCode | string;
  metadata?: Record<string, unknown> | null;
  settings: CollateralSettings;
  currentYear?: number;
}

export interface AcceptedValueResult {
  acceptedValue: number;
  discountApplied: number | null;
  discountReason: string | null;
}

export interface EstimateInputItem {
  typeCode: CollateralTypeCode | string;
  marketValue: number | string;
  acceptedValue: number | string;
}

export interface EstimateTotals {
  totalMarketValue: number;
  totalAcceptedValue: number;
  requiredCollateralValue: number;
  coveragePercent: number;
  maxLoanAmount: number;
  resultStatus: CollateralResultStatus;
  shortfall: number;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function roundDiscount(value: number): number {
  return Number(value.toFixed(4));
}

export function roundCoveragePercent(value: number): number {
  return Number(value.toFixed(2));
}

export function roundRate(value: number): number {
  return Number(value.toFixed(3));
}

// Extract the leading numeric value from a free-form rate string like
// "24%", "24,5%", "24-26%", or "от 24%". Returns null for ranges where the
// caller should keep the raw string instead.
export function extractAnnualRate(raw: string | null | undefined): {
  numeric: number | null;
  raw: string | null;
} {
  if (raw === null || raw === undefined) return { numeric: null, raw: null };
  const trimmed = String(raw).trim();
  if (!trimmed) return { numeric: null, raw: null };

  const match = trimmed.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return { numeric: null, raw: trimmed };

  const parsed = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(parsed)) return { numeric: null, raw: trimmed };

  return { numeric: roundRate(parsed), raw: trimmed };
}

export function calculateAcceptedValue(input: AcceptedValueInput): AcceptedValueResult {
  const marketValue = toNumber(input.marketValue);
  if (marketValue <= 0) {
    throw new Error("marketValue must be > 0");
  }

  // Only rule: transport older than the configured threshold gets the
  // configured discount. Everything else (real estate, jewelry, land plot,
  // equipment) is accepted at face value.
  if (input.typeCode === "transport") {
    const year = (input.metadata as { year?: number } | null | undefined)?.year;
    if (typeof year === "number" && Number.isFinite(year)) {
      const currentYear = input.currentYear ?? new Date().getFullYear();
      const age = currentYear - year;
      if (age > input.settings.transportAgeThreshold) {
        const discount = input.settings.transportAgeDiscount;
        return {
          acceptedValue: roundMoney(marketValue * discount),
          discountApplied: roundDiscount(discount),
          discountReason: "transport_age_over_threshold",
        };
      }
    }
  }

  return {
    acceptedValue: roundMoney(marketValue),
    discountApplied: null,
    discountReason: null,
  };
}

export function calculateEstimateTotals(input: {
  items: EstimateInputItem[];
  requestedLoanAmount: number | string;
  coverageRatio: number;
}): EstimateTotals {
  const requestedLoanAmount = toNumber(input.requestedLoanAmount);
  if (requestedLoanAmount <= 0) {
    throw new Error("requestedLoanAmount must be > 0");
  }
  if (input.coverageRatio <= 0) {
    throw new Error("coverageRatio must be > 0");
  }
  if (input.items.length === 0) {
    throw new Error("at least one collateral item is required");
  }

  let totalMarketValue = 0;
  let totalAcceptedValue = 0;
  for (const item of input.items) {
    totalMarketValue += toNumber(item.marketValue);
    totalAcceptedValue += toNumber(item.acceptedValue);
  }

  const requiredCollateralValue = requestedLoanAmount * input.coverageRatio;
  const coveragePercent = (totalAcceptedValue / requestedLoanAmount) * 100;
  const maxLoanAmount = totalAcceptedValue / input.coverageRatio;
  const resultStatus: CollateralResultStatus =
    coveragePercent >= input.coverageRatio * 100 ? "enough" : "not_enough";
  const shortfall = Math.max(0, requiredCollateralValue - totalAcceptedValue);

  return {
    totalMarketValue: roundMoney(totalMarketValue),
    totalAcceptedValue: roundMoney(totalAcceptedValue),
    requiredCollateralValue: roundMoney(requiredCollateralValue),
    coveragePercent: roundCoveragePercent(coveragePercent),
    maxLoanAmount: roundMoney(maxLoanAmount),
    resultStatus,
    shortfall: roundMoney(shortfall),
  };
}

export function isEquipmentOnly(items: EstimateInputItem[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => item.typeCode === "equipment");
}
