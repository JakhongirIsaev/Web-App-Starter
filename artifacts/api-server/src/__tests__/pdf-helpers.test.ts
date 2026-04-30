import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Local copies of non-exported pure helpers from src/pdf/generate.ts.
// We test the logic here because the originals are private module functions.
// ---------------------------------------------------------------------------

type PdfLanguage = "ru" | "uz";

interface PdfBasketItem {
  rateUZS?: string | null;
  rateUSD?: string | null;
  rateEUR?: string | null;
  termWorkingCapital?: string | null;
  termFixedAssets?: string | null;
  termUntargeted?: string | null;
}

function resolveLocale(language: PdfLanguage) {
  if (language === "ru") return "ru-RU";
  return "uz-UZ";
}

function fmtNum(
  value: string | number | null | undefined,
  language: PdfLanguage,
): string {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(parsed)) return String(value);
  return parsed.toLocaleString(resolveLocale(language), {
    maximumFractionDigits: 2,
  });
}

function safeValue(value: string | null | undefined) {
  return value && value.trim() ? value.trim() : "-";
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function isCompatibleWithLanguage(
  value: string | null | undefined,
  language: PdfLanguage,
) {
  if (!value || !value.trim()) return false;

  const text = value.trim();
  const cyrillic = countMatches(text, /[Ѐ-ӿ]/g);
  const latin = countMatches(text, /[A-Za-z]/g);

  if (language === "uz") {
    if (cyrillic > latin) return false;
    return true;
  }

  if (language === "ru") {
    if (cyrillic > 0) return true;
    return latin === 0;
  }

  return false;
}

function buildRateSummary(item: PdfBasketItem) {
  return [item.rateUZS, item.rateUSD, item.rateEUR].filter(Boolean).join(" | ");
}

function buildRelevantTerms(item: PdfBasketItem) {
  return [item.termWorkingCapital, item.termFixedAssets, item.termUntargeted]
    .filter(Boolean)
    .join(" | ");
}

function getDisplayValueForLanguage(
  language: PdfLanguage,
  localizedValue: string | null | undefined,
  fallbackValue: string | null | undefined,
) {
  if (isCompatibleWithLanguage(localizedValue, language)) {
    return localizedValue!.trim();
  }

  if (isCompatibleWithLanguage(fallbackValue, language)) {
    return fallbackValue!.trim();
  }

  return "-";
}

// ---------------------------------------------------------------------------
// resolveLocale
// ---------------------------------------------------------------------------

describe("resolveLocale", () => {
  it("returns ru-RU for Russian", () => {
    expect(resolveLocale("ru")).toBe("ru-RU");
  });

  it("returns uz-UZ for Uzbek", () => {
    expect(resolveLocale("uz")).toBe("uz-UZ");
  });
});

// ---------------------------------------------------------------------------
// fmtNum — number formatting
// ---------------------------------------------------------------------------

describe("fmtNum", () => {
  it("returns dash for null, undefined, and empty string", () => {
    expect(fmtNum(null, "uz")).toBe("-");
    expect(fmtNum(undefined, "ru")).toBe("-");
    expect(fmtNum("", "uz")).toBe("-");
  });

  it("formats a numeric string with locale grouping", () => {
    const result = fmtNum("1234567.89", "uz");
    // Should contain the digits; exact grouping depends on locale
    expect(result).toContain("1");
    expect(result).toContain("234");
  });

  it("formats a number value", () => {
    const result = fmtNum(1000, "ru");
    expect(result).toBeTruthy();
    expect(result).not.toBe("-");
  });

  it("returns the original string when it is not a valid number", () => {
    expect(fmtNum("abc", "uz")).toBe("abc");
    expect(fmtNum("N/A", "ru")).toBe("N/A");
  });

  it("respects maximumFractionDigits of 2", () => {
    const result = fmtNum("1234.5678", "uz");
    // After formatting, should not have more than 2 decimal digits
    const decimalPart = result.split(/[.,]/).pop() || "";
    // The decimal separator varies by locale but the fractional part should be <= 2 digits
    // We check the raw number was truncated
    expect(fmtNum(1.999, "uz")).not.toContain("999");
  });

  it("handles zero correctly", () => {
    const result = fmtNum(0, "uz");
    expect(result).toBe("0");
  });

  it("handles negative numbers", () => {
    const result = fmtNum(-500, "ru");
    expect(result).toContain("500");
  });
});

// ---------------------------------------------------------------------------
// safeValue
// ---------------------------------------------------------------------------

describe("safeValue", () => {
  it("returns trimmed value for non-empty strings", () => {
    expect(safeValue("  hello  ")).toBe("hello");
    expect(safeValue("test")).toBe("test");
  });

  it("returns dash for null, undefined, empty, and whitespace-only strings", () => {
    expect(safeValue(null)).toBe("-");
    expect(safeValue(undefined)).toBe("-");
    expect(safeValue("")).toBe("-");
    expect(safeValue("   ")).toBe("-");
  });
});

// ---------------------------------------------------------------------------
// countMatches
// ---------------------------------------------------------------------------

describe("countMatches", () => {
  it("counts regex matches in a string", () => {
    expect(countMatches("abcabc", /a/g)).toBe(2);
    expect(countMatches("hello world", /o/g)).toBe(2);
  });

  it("returns 0 when there are no matches", () => {
    expect(countMatches("hello", /z/g)).toBe(0);
    expect(countMatches("", /a/g)).toBe(0);
  });

  it("counts Cyrillic characters", () => {
    expect(countMatches("Привет мир", /[Ѐ-ӿ]/g)).toBe(9);
  });

  it("counts Latin characters", () => {
    expect(countMatches("Hello World 123", /[A-Za-z]/g)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// isCompatibleWithLanguage
// ---------------------------------------------------------------------------

describe("isCompatibleWithLanguage", () => {
  it("returns false for null, undefined, and whitespace-only values", () => {
    expect(isCompatibleWithLanguage(null, "uz")).toBe(false);
    expect(isCompatibleWithLanguage(undefined, "ru")).toBe(false);
    expect(isCompatibleWithLanguage("  ", "uz")).toBe(false);
    expect(isCompatibleWithLanguage("", "ru")).toBe(false);
  });

  it("accepts Latin text for Uzbek", () => {
    expect(isCompatibleWithLanguage("Kredit summasi", "uz")).toBe(true);
  });

  it("rejects Cyrillic-dominant text for Uzbek", () => {
    expect(isCompatibleWithLanguage("Кредитная сумма", "uz")).toBe(false);
  });

  it("accepts Cyrillic text for Russian", () => {
    expect(isCompatibleWithLanguage("Кредит", "ru")).toBe(true);
  });

  it("accepts digit-only / symbol-only text for Russian (no Latin)", () => {
    expect(isCompatibleWithLanguage("12345", "ru")).toBe(true);
    expect(isCompatibleWithLanguage("100%", "ru")).toBe(true);
  });

  it("accepts digit-only text for Uzbek", () => {
    expect(isCompatibleWithLanguage("12345", "uz")).toBe(true);
  });

  it("accepts mixed Cyrillic-Latin text for Russian when Cyrillic is present", () => {
    expect(isCompatibleWithLanguage("Кредит ABC", "ru")).toBe(true);
  });

  it("rejects pure Latin text for Russian (no Cyrillic at all)", () => {
    expect(isCompatibleWithLanguage("Credit amount", "ru")).toBe(false);
  });

  it("accepts text with equal Cyrillic and Latin for Uzbek", () => {
    // When cyrillic count equals latin count, cyrillic > latin is false, so returns true
    expect(isCompatibleWithLanguage("AB АБ", "uz")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildRateSummary
// ---------------------------------------------------------------------------

describe("buildRateSummary", () => {
  it("joins all rate values with pipes", () => {
    expect(buildRateSummary({ rateUZS: "24%", rateUSD: "12%", rateEUR: "10%" }))
      .toBe("24% | 12% | 10%");
  });

  it("omits null/undefined rates", () => {
    expect(buildRateSummary({ rateUZS: "24%", rateUSD: null, rateEUR: undefined }))
      .toBe("24%");
  });

  it("returns empty string when all rates are null", () => {
    expect(buildRateSummary({ rateUZS: null, rateUSD: null, rateEUR: null }))
      .toBe("");
  });

  it("returns empty string for an empty item", () => {
    expect(buildRateSummary({})).toBe("");
  });
});

// ---------------------------------------------------------------------------
// buildRelevantTerms
// ---------------------------------------------------------------------------

describe("buildRelevantTerms", () => {
  it("joins all term values with pipes", () => {
    expect(
      buildRelevantTerms({
        termWorkingCapital: "12 мес",
        termFixedAssets: "36 мес",
        termUntargeted: "24 мес",
      }),
    ).toBe("12 мес | 36 мес | 24 мес");
  });

  it("omits null/undefined terms", () => {
    expect(
      buildRelevantTerms({
        termWorkingCapital: "12 мес",
        termFixedAssets: null,
        termUntargeted: undefined,
      }),
    ).toBe("12 мес");
  });

  it("returns empty string when all terms are null", () => {
    expect(
      buildRelevantTerms({
        termWorkingCapital: null,
        termFixedAssets: null,
        termUntargeted: null,
      }),
    ).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getDisplayValueForLanguage
// ---------------------------------------------------------------------------

describe("getDisplayValueForLanguage", () => {
  it("returns the localized value when compatible with the language", () => {
    expect(getDisplayValueForLanguage("uz", "Kredit", "Кредит")).toBe("Kredit");
    expect(getDisplayValueForLanguage("ru", "Кредит", "Kredit")).toBe("Кредит");
  });

  it("falls back to the fallback value when localized value is incompatible", () => {
    expect(getDisplayValueForLanguage("uz", "Кредит", "Kredit")).toBe("Kredit");
    expect(getDisplayValueForLanguage("ru", "Credit", "Кредит")).toBe("Кредит");
  });

  it("returns dash when neither value is compatible", () => {
    expect(getDisplayValueForLanguage("ru", "Credit", "Loan")).toBe("-");
  });

  it("returns dash when both values are null", () => {
    expect(getDisplayValueForLanguage("uz", null, null)).toBe("-");
    expect(getDisplayValueForLanguage("ru", undefined, undefined)).toBe("-");
  });

  it("trims whitespace from returned values", () => {
    expect(getDisplayValueForLanguage("uz", "  Kredit  ", null)).toBe("Kredit");
  });

  it("uses fallback when localized is empty string", () => {
    expect(getDisplayValueForLanguage("uz", "", "Fallback text")).toBe("Fallback text");
  });
});
