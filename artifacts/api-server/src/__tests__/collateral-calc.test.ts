import { describe, it, expect } from "vitest";
import {
  calculateAcceptedValue,
  calculateEstimateTotals,
  extractAnnualRate,
  isEquipmentOnly,
  roundCoveragePercent,
  roundMoney,
  type CollateralSettings,
  type EstimateInputItem,
} from "../lib/collateral-calc";

const DEFAULT_SETTINGS: CollateralSettings = {
  coverageRatio: 1.25,
  transportAgeThreshold: 7,
  transportAgeDiscount: 0.4,
};

describe("calculateAcceptedValue", () => {
  it("accepts non-transport types at full market value", () => {
    for (const typeCode of ["real_estate", "jewelry", "land_plot", "equipment"] as const) {
      const result = calculateAcceptedValue({
        typeCode,
        marketValue: 100_000_000,
        settings: DEFAULT_SETTINGS,
      });
      expect(result.acceptedValue).toBe(100_000_000);
      expect(result.discountApplied).toBeNull();
      expect(result.discountReason).toBeNull();
    }
  });

  it("accepts transport ≤ 7 years at full market value", () => {
    const result = calculateAcceptedValue({
      typeCode: "transport",
      marketValue: 70_000_000,
      metadata: { year: 2020 },
      settings: DEFAULT_SETTINGS,
      currentYear: 2026,
    });
    expect(result.acceptedValue).toBe(70_000_000);
    expect(result.discountApplied).toBeNull();
    expect(result.discountReason).toBeNull();
  });

  it("applies 40% discount to transport > 7 years (spec Example 2)", () => {
    const result = calculateAcceptedValue({
      typeCode: "transport",
      marketValue: 80_000_000,
      metadata: { year: 2015 },
      settings: DEFAULT_SETTINGS,
      currentYear: 2026,
    });
    expect(result.acceptedValue).toBe(32_000_000);
    expect(result.discountApplied).toBe(0.4);
    expect(result.discountReason).toBe("transport_age_over_threshold");
  });

  it("treats transport without year metadata as full value (no age info, no discount)", () => {
    const result = calculateAcceptedValue({
      typeCode: "transport",
      marketValue: 50_000_000,
      metadata: {},
      settings: DEFAULT_SETTINGS,
      currentYear: 2026,
    });
    expect(result.acceptedValue).toBe(50_000_000);
    expect(result.discountApplied).toBeNull();
  });

  it("respects custom threshold and discount from settings", () => {
    const result = calculateAcceptedValue({
      typeCode: "transport",
      marketValue: 100_000_000,
      metadata: { year: 2020 },
      settings: { coverageRatio: 1.25, transportAgeThreshold: 3, transportAgeDiscount: 0.5 },
      currentYear: 2026,
    });
    expect(result.acceptedValue).toBe(50_000_000);
    expect(result.discountApplied).toBe(0.5);
  });

  it("throws on non-positive marketValue", () => {
    expect(() =>
      calculateAcceptedValue({
        typeCode: "real_estate",
        marketValue: 0,
        settings: DEFAULT_SETTINGS,
      }),
    ).toThrow("marketValue must be > 0");
  });

  it("accepts string-typed market values (Drizzle returns numeric as string)", () => {
    const result = calculateAcceptedValue({
      typeCode: "transport",
      marketValue: "80000000",
      metadata: { year: 2015 },
      settings: DEFAULT_SETTINGS,
      currentYear: 2026,
    });
    expect(result.acceptedValue).toBe(32_000_000);
  });
});

describe("calculateEstimateTotals", () => {
  it("Example 1: mixed collateral, exactly enough at 125%", () => {
    const items: EstimateInputItem[] = [
      { typeCode: "transport", marketValue: 70_000_000, acceptedValue: 70_000_000 },
      { typeCode: "jewelry", marketValue: 55_000_000, acceptedValue: 55_000_000 },
    ];
    const totals = calculateEstimateTotals({
      items,
      requestedLoanAmount: 100_000_000,
      coverageRatio: 1.25,
    });

    expect(totals.totalMarketValue).toBe(125_000_000);
    expect(totals.totalAcceptedValue).toBe(125_000_000);
    expect(totals.requiredCollateralValue).toBe(125_000_000);
    expect(totals.coveragePercent).toBe(125);
    expect(totals.maxLoanAmount).toBe(100_000_000);
    expect(totals.resultStatus).toBe("enough");
    expect(totals.shortfall).toBe(0);
  });

  it("Example 2: old car, not enough", () => {
    const totals = calculateEstimateTotals({
      items: [{ typeCode: "transport", marketValue: 80_000_000, acceptedValue: 32_000_000 }],
      requestedLoanAmount: 50_000_000,
      coverageRatio: 1.25,
    });

    expect(totals.totalAcceptedValue).toBe(32_000_000);
    expect(totals.requiredCollateralValue).toBe(62_500_000);
    expect(totals.coveragePercent).toBe(64);
    expect(totals.maxLoanAmount).toBe(25_600_000);
    expect(totals.resultStatus).toBe("not_enough");
    expect(totals.shortfall).toBe(30_500_000);
  });

  it("Example 3: equipment-only, enough on coverage but warning flag fires", () => {
    const items: EstimateInputItem[] = [
      { typeCode: "equipment", marketValue: 200_000_000, acceptedValue: 200_000_000 },
    ];
    const totals = calculateEstimateTotals({
      items,
      requestedLoanAmount: 100_000_000,
      coverageRatio: 1.25,
    });

    expect(totals.coveragePercent).toBe(200);
    expect(totals.resultStatus).toBe("enough");
    expect(isEquipmentOnly(items)).toBe(true);
  });

  it("Example 4: third-party real estate", () => {
    const totals = calculateEstimateTotals({
      items: [{ typeCode: "real_estate", marketValue: 300_000_000, acceptedValue: 300_000_000 }],
      requestedLoanAmount: 200_000_000,
      coverageRatio: 1.25,
    });

    expect(totals.coveragePercent).toBe(150);
    expect(totals.resultStatus).toBe("enough");
  });

  it("Example 5: multiple items same type sum together", () => {
    const totals = calculateEstimateTotals({
      items: [
        { typeCode: "real_estate", marketValue: 200_000_000, acceptedValue: 200_000_000 },
        { typeCode: "real_estate", marketValue: 100_000_000, acceptedValue: 100_000_000 },
      ],
      requestedLoanAmount: 200_000_000,
      coverageRatio: 1.25,
    });

    expect(totals.totalAcceptedValue).toBe(300_000_000);
    expect(totals.coveragePercent).toBe(150);
    expect(totals.resultStatus).toBe("enough");
  });

  it("AC4: 120M collateral against 100M loan = not_enough, 5M shortfall", () => {
    const totals = calculateEstimateTotals({
      items: [{ typeCode: "real_estate", marketValue: 120_000_000, acceptedValue: 120_000_000 }],
      requestedLoanAmount: 100_000_000,
      coverageRatio: 1.25,
    });

    expect(totals.coveragePercent).toBe(120);
    expect(totals.resultStatus).toBe("not_enough");
    expect(totals.shortfall).toBe(5_000_000);
  });

  it("respects a custom coverage ratio (admin-tuned setting)", () => {
    const totals = calculateEstimateTotals({
      items: [{ typeCode: "real_estate", marketValue: 130_000_000, acceptedValue: 130_000_000 }],
      requestedLoanAmount: 100_000_000,
      coverageRatio: 1.3,
    });

    expect(totals.requiredCollateralValue).toBe(130_000_000);
    expect(totals.resultStatus).toBe("enough");
  });

  it("throws on empty items list", () => {
    expect(() =>
      calculateEstimateTotals({
        items: [],
        requestedLoanAmount: 100_000_000,
        coverageRatio: 1.25,
      }),
    ).toThrow("at least one collateral item is required");
  });

  it("throws on non-positive requested amount", () => {
    expect(() =>
      calculateEstimateTotals({
        items: [{ typeCode: "real_estate", marketValue: 1, acceptedValue: 1 }],
        requestedLoanAmount: 0,
        coverageRatio: 1.25,
      }),
    ).toThrow("requestedLoanAmount must be > 0");
  });
});

describe("isEquipmentOnly", () => {
  it("returns false for empty list", () => {
    expect(isEquipmentOnly([])).toBe(false);
  });

  it("returns true when every item is equipment", () => {
    expect(
      isEquipmentOnly([
        { typeCode: "equipment", marketValue: 1, acceptedValue: 1 },
        { typeCode: "equipment", marketValue: 1, acceptedValue: 1 },
      ]),
    ).toBe(true);
  });

  it("returns false when any non-equipment item is present", () => {
    expect(
      isEquipmentOnly([
        { typeCode: "equipment", marketValue: 1, acceptedValue: 1 },
        { typeCode: "transport", marketValue: 1, acceptedValue: 1 },
      ]),
    ).toBe(false);
  });
});

describe("extractAnnualRate", () => {
  it("extracts plain percent string", () => {
    expect(extractAnnualRate("24%")).toEqual({ numeric: 24, raw: "24%" });
  });

  it("extracts decimal with comma (Russian format)", () => {
    expect(extractAnnualRate("24,5%")).toEqual({ numeric: 24.5, raw: "24,5%" });
  });

  it("extracts leading number from a range, keeps full raw text", () => {
    expect(extractAnnualRate("24-26%")).toEqual({ numeric: 24, raw: "24-26%" });
  });

  it("extracts from prefixed text", () => {
    expect(extractAnnualRate("от 24%")).toEqual({ numeric: 24, raw: "от 24%" });
  });

  it("returns null for empty / nullish", () => {
    expect(extractAnnualRate("")).toEqual({ numeric: null, raw: null });
    expect(extractAnnualRate(null)).toEqual({ numeric: null, raw: null });
    expect(extractAnnualRate(undefined)).toEqual({ numeric: null, raw: null });
  });

  it("preserves raw text when no number is parseable", () => {
    expect(extractAnnualRate("по запросу")).toEqual({ numeric: null, raw: "по запросу" });
  });

  it("rounds to 3 decimals (matches numeric(6,3) schema)", () => {
    expect(extractAnnualRate("24.123456%")).toEqual({ numeric: 24.123, raw: "24.123456%" });
  });
});

describe("rounding helpers", () => {
  it("roundMoney rounds to 2 decimals", () => {
    expect(roundMoney(123.456)).toBe(123.46);
    expect(roundMoney(123.454)).toBe(123.45);
  });

  it("roundCoveragePercent rounds to 2 decimals", () => {
    expect(roundCoveragePercent(125.456)).toBe(125.46);
    expect(roundCoveragePercent(125.4)).toBe(125.4);
  });
});
