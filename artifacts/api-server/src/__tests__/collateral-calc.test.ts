import { describe, it, expect } from "vitest";
import {
  calculateAcceptedValue,
  calculateEstimateTotals,
  extractAnnualRate,
  getTransportDiscount,
  isEquipmentOnly,
  REAL_ESTATE_DISCOUNT,
  roundCoveragePercent,
  type CollateralSettings,
  type EstimateInputItem,
} from "../lib/collateral-calc";
import { roundMoney } from "../lib/money";

const DEFAULT_SETTINGS: CollateralSettings = {
  coverageRatio: 1.25,
  transportAgeThreshold: 7,
  transportAgeDiscount: 0.4,
};

describe("getTransportDiscount", () => {
  it("returns 0.70 for age ≤ 3", () => {
    expect(getTransportDiscount(0)).toBe(0.70);
    expect(getTransportDiscount(1)).toBe(0.70);
    expect(getTransportDiscount(3)).toBe(0.70);
  });

  it("returns 0.60 for age 4-5", () => {
    expect(getTransportDiscount(4)).toBe(0.60);
    expect(getTransportDiscount(5)).toBe(0.60);
  });

  it("returns 0.50 for age 6-7", () => {
    expect(getTransportDiscount(6)).toBe(0.50);
    expect(getTransportDiscount(7)).toBe(0.50);
  });

  it("returns 0.30 for age > 7", () => {
    expect(getTransportDiscount(8)).toBe(0.30);
    expect(getTransportDiscount(15)).toBe(0.30);
  });
});

describe("calculateAcceptedValue", () => {
  it("applies 60% discount to real_estate", () => {
    const result = calculateAcceptedValue({
      typeCode: "real_estate",
      marketValue: 100_000_000,
      settings: DEFAULT_SETTINGS,
    });
    expect(result.acceptedValue).toBe(60_000_000);
    expect(result.discountApplied).toBe(0.6);
    expect(result.discountReason).toBe("real_estate_standard");
  });

  it("applies 60% discount to land_plot (same as real_estate)", () => {
    const result = calculateAcceptedValue({
      typeCode: "land_plot",
      marketValue: 100_000_000,
      settings: DEFAULT_SETTINGS,
    });
    expect(result.acceptedValue).toBe(60_000_000);
    expect(result.discountApplied).toBe(0.6);
    expect(result.discountReason).toBe("real_estate_standard");
  });

  it("accepts jewelry and equipment at face value", () => {
    for (const typeCode of ["jewelry", "equipment"] as const) {
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

  it("applies 70% to transport ≤ 3 years old", () => {
    const result = calculateAcceptedValue({
      typeCode: "transport",
      marketValue: 100_000_000,
      metadata: { year: 2024 },
      settings: DEFAULT_SETTINGS,
      currentYear: 2026,
    });
    expect(result.acceptedValue).toBe(70_000_000);
    expect(result.discountApplied).toBe(0.7);
    expect(result.discountReason).toBe("transport_age_0_3");
  });

  it("applies 60% to transport 4-5 years old", () => {
    const result = calculateAcceptedValue({
      typeCode: "transport",
      marketValue: 100_000_000,
      metadata: { year: 2022 },
      settings: DEFAULT_SETTINGS,
      currentYear: 2026,
    });
    expect(result.acceptedValue).toBe(60_000_000);
    expect(result.discountApplied).toBe(0.6);
    expect(result.discountReason).toBe("transport_age_3_5");
  });

  it("applies 50% to transport 6-7 years old", () => {
    const result = calculateAcceptedValue({
      typeCode: "transport",
      marketValue: 100_000_000,
      metadata: { year: 2020 },
      settings: DEFAULT_SETTINGS,
      currentYear: 2026,
    });
    expect(result.acceptedValue).toBe(50_000_000);
    expect(result.discountApplied).toBe(0.5);
    expect(result.discountReason).toBe("transport_age_5_7");
  });

  it("applies 30% to transport > 7 years old", () => {
    const result = calculateAcceptedValue({
      typeCode: "transport",
      marketValue: 80_000_000,
      metadata: { year: 2015 },
      settings: DEFAULT_SETTINGS,
      currentYear: 2026,
    });
    expect(result.acceptedValue).toBe(24_000_000);
    expect(result.discountApplied).toBe(0.3);
    expect(result.discountReason).toBe("transport_age_7plus");
  });

  it("treats transport without year metadata as face value", () => {
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
    expect(result.acceptedValue).toBe(24_000_000);
  });
});

describe("calculateEstimateTotals", () => {
  it("mixed collateral, enough at 125%", () => {
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

  it("old car with 30% coefficient, not enough", () => {
    const totals = calculateEstimateTotals({
      items: [{ typeCode: "transport", marketValue: 80_000_000, acceptedValue: 24_000_000 }],
      requestedLoanAmount: 50_000_000,
      coverageRatio: 1.25,
    });

    expect(totals.totalAcceptedValue).toBe(24_000_000);
    expect(totals.requiredCollateralValue).toBe(62_500_000);
    expect(totals.coveragePercent).toBe(48);
    expect(totals.maxLoanAmount).toBe(19_200_000);
    expect(totals.resultStatus).toBe("not_enough");
  });

  it("equipment-only, enough on coverage but warning flag fires", () => {
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

  it("real estate with 60% discount", () => {
    const totals = calculateEstimateTotals({
      items: [{ typeCode: "real_estate", marketValue: 300_000_000, acceptedValue: 180_000_000 }],
      requestedLoanAmount: 100_000_000,
      coverageRatio: 1.25,
    });

    expect(totals.coveragePercent).toBe(180);
    expect(totals.resultStatus).toBe("enough");
  });

  it("multiple items same type sum together", () => {
    const totals = calculateEstimateTotals({
      items: [
        { typeCode: "jewelry", marketValue: 200_000_000, acceptedValue: 200_000_000 },
        { typeCode: "jewelry", marketValue: 100_000_000, acceptedValue: 100_000_000 },
      ],
      requestedLoanAmount: 200_000_000,
      coverageRatio: 1.25,
    });

    expect(totals.totalAcceptedValue).toBe(300_000_000);
    expect(totals.coveragePercent).toBe(150);
    expect(totals.resultStatus).toBe("enough");
  });

  it("respects a custom coverage ratio", () => {
    const totals = calculateEstimateTotals({
      items: [{ typeCode: "jewelry", marketValue: 130_000_000, acceptedValue: 130_000_000 }],
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
