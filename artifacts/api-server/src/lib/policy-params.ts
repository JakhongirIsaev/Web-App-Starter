import { db, policyParamVersionsTable } from "@workspace/db";
import { lte, isNull, or, gt, and, desc } from "drizzle-orm";

export interface PolicyParams {
  minCoverageRatio: number;                             // 1.25
  collateralDiscounts: {
    governmentSecurities: number;                       // 1.00
    realEstate: number;                                 // 0.90
    vehicles: number;                                   // 0.80
    corporateSecurities: number;                        // 0.80
    inventoryCirculation: number;                       // 0.80
    equipment: number;                                  // 0.70
  };
  transportAgeThresholdYears: number;                   // 7
  transportAgeDiscount: number;                         // 0.40
  dscrMax: number;                                      // 0.80
  dscrMaxFx: number;                                    // 0.50
  debtToEquityMax: number;                              // 1.00
  loanToWorkingCapitalMax: number;                      // 0.70
  minRatesUzs: {
    micro:  { le12m: number; gt12m: number };
    small:  { le12m: number; gt12m: number };
    medium: { any: number };
  };
  minRatesFx: {
    micro: number;
    small: number;
    medium: number;
  };
  maxTermMonths: {
    workingCapital: number;
    fixedAssets: number;
  };
  negativeIndustryKeywords: string[];
  graduatedLending: {
    loan1MaxMonths: number;
    loan1MaxMonthsTrade: number;
    loan2MaxMonths: number;
    loan3MaxMonths: number;
  };
  creditCommitteeLimitsUsd: {
    singleBorrower: number;
    relatedGroup: number;
  };
}

export function defaultPolicyParams(): PolicyParams {
  return {
    minCoverageRatio: 1.25,
    collateralDiscounts: {
      governmentSecurities: 1.00,
      realEstate: 0.90,
      vehicles: 0.80,
      corporateSecurities: 0.80,
      inventoryCirculation: 0.80,
      equipment: 0.70,
    },
    transportAgeThresholdYears: 7,
    transportAgeDiscount: 0.40,
    dscrMax: 0.80,
    dscrMaxFx: 0.50,
    debtToEquityMax: 1.00,
    loanToWorkingCapitalMax: 0.70,
    minRatesUzs: {
      micro:  { le12m: 0.24, gt12m: 0.26 },
      small:  { le12m: 0.24, gt12m: 0.25 },
      medium: { any:   0.24 },
    },
    minRatesFx: { micro: 0.14, small: 0.13, medium: 0.12 },
    maxTermMonths: { workingCapital: 36, fixedAssets: 60 },
    negativeIndustryKeywords: [
      "tobacco","weapons","gambling","casino","alcoholic_strong",
      "fur","endangered","currency_speculation","securities_invest",
    ],
    graduatedLending: {
      loan1MaxMonths: 6,
      loan1MaxMonthsTrade: 3,
      loan2MaxMonths: 9,
      loan3MaxMonths: 12,
    },
    creditCommitteeLimitsUsd: {
      singleBorrower: 1_000_000.01,
      relatedGroup:   5_000_000.01,
    },
  };
}

let cache: { value: PolicyParams; loadedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getActivePolicyParams(asOf: Date = new Date()): Promise<PolicyParams> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.value;
  const [row] = await db
    .select()
    .from(policyParamVersionsTable)
    .where(
      and(
        lte(policyParamVersionsTable.effectiveFrom, asOf),
        or(
          isNull(policyParamVersionsTable.effectiveTo),
          gt(policyParamVersionsTable.effectiveTo, asOf),
        ),
      ),
    )
    .orderBy(desc(policyParamVersionsTable.effectiveFrom))
    .limit(1);
  const value = (row?.value as PolicyParams) ?? defaultPolicyParams();
  cache = { value, loadedAt: Date.now() };
  return value;
}

export function _resetPolicyParamsCacheForTests(): void {
  cache = null;
}
