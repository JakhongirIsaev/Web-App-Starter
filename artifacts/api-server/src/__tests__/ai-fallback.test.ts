import { describe, it, expect } from "vitest";
import {
  AiRecommendProductsResponse,
  AiExtractAutoResponse,
} from "@workspace/api-zod";
import type {
  AiRecommendProductsBodyType,
  AiExtractAutoResponseType,
} from "@workspace/api-zod";

// ---------------------------------------------------------------------------
// Local versions of internal (non-exported) fallback functions copied from
// ai/service.ts.  We test the logic here because the originals are private.
// ---------------------------------------------------------------------------

function trimText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function fallbackRecommendation(input: AiRecommendProductsBodyType) {
  const language = input.language === "ru" ? "ru" : "uz";
  const recommendations = input.allowedProducts.slice(0, 5).map((product, index) => {
    const fallbackParts = [
      product.segment
        ? language === "ru"
          ? `Сегмент: ${product.segment}.`
          : `Segment: ${product.segment}.`
        : "",
      product.purpose
        ? language === "ru"
          ? `Потребность клиента: ${product.purpose}.`
          : `Mijoz ehtiyoji: ${product.purpose}.`
        : "",
      product.highlight
        ? language === "ru"
          ? `Ключевое преимущество: ${product.highlight}.`
          : `Asosiy afzallik: ${product.highlight}.`
        : "",
    ].join(" ");

    return {
      productId: product.id ?? null,
      productName: product.name,
      rank: index + 1,
      confidence: Number(Math.max(0.35, 0.8 - index * 0.1).toFixed(2)),
      explanation:
        trimText(product.whySuitable || "") ||
        trimText(fallbackParts) ||
        (language === "ru"
          ? "Выбрано из разрешенного каталога по текущему профилю клиента."
          : "Joriy mijoz profili bo'yicha ruxsat etilgan katalogdan tanlandi."),
      localizedSegment: product.segment ?? null,
      localizedPurpose: product.purpose ?? null,
      localizedHighlight: product.highlight ?? null,
      localizedLoanAmount: product.loanAmount ?? null,
      localizedRate:
        [product.rateUZS, product.rateUSD, product.rateEUR].filter(Boolean).join(" | ") || null,
      localizedRelevantTerm:
        [product.termWorkingCapital, product.termFixedAssets, product.termUntargeted]
          .filter(Boolean)
          .join(" | ") || null,
      localizedDisbursementForm: product.disbursementForm ?? null,
      localizedGracePeriod: null,
    };
  });

  return AiRecommendProductsResponse.parse({ recommendations });
}

function fallbackAutoExtractionFromOcr(
  ocrText?: string | null,
): AiExtractAutoResponseType {
  const plateMatch = ocrText?.match(
    /\b(?:\d{2}[A-Z]\d{3}[A-Z]{2}|[A-Z]{1,3}\s?\d{2,4}\s?[A-Z]{1,3})\b/i,
  );
  const yearMatch = ocrText?.match(/\b(19\d{2}|20\d{2})\b/);

  return AiExtractAutoResponse.parse({
    make: null,
    model: null,
    vehicleType: null,
    color: null,
    plateText: plateMatch?.[0] ?? null,
    approximateYear: yearMatch?.[1] ?? null,
    visibleConditionNotes: null,
    confidence: 0.2,
    rawNotes: ocrText ? ocrText.slice(0, 400) : null,
  });
}

// ---------------------------------------------------------------------------
// fallbackRecommendation
// ---------------------------------------------------------------------------

describe("fallbackRecommendation", () => {
  const baseInput: AiRecommendProductsBodyType = {
    language: "uz",
    questionnaireAnswers: [],
    allowedProducts: [
      {
        name: "Working Capital Line",
        id: 1,
        segment: "SME",
        purpose: "Aylanma mablag'",
        highlight: "Tez",
        loanAmount: "100M-1B",
        rateUZS: "24%",
      },
      {
        name: "Equipment Lease",
        id: 2,
        segment: "Corporate",
        highlight: "Flexible terms",
      },
      { name: "Express Loan", id: 3 },
    ],
  };

  it("returns a valid AiRecommendProductsResponse shape", () => {
    const result = fallbackRecommendation(baseInput);
    // Should not throw during .parse inside fallbackRecommendation
    expect(result.recommendations).toBeDefined();
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it("ranks products by their index (1-based)", () => {
    const result = fallbackRecommendation(baseInput);
    expect(result.recommendations[0].rank).toBe(1);
    expect(result.recommendations[1].rank).toBe(2);
    expect(result.recommendations[2].rank).toBe(3);
  });

  it("produces decreasing confidence scores", () => {
    const result = fallbackRecommendation(baseInput);
    const confidences = result.recommendations.map((r) => r.confidence);
    for (let i = 1; i < confidences.length; i++) {
      expect(confidences[i]).toBeLessThanOrEqual(confidences[i - 1]);
    }
  });

  it("caps at 5 products even if more are provided", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      name: `Product ${i}`,
      id: i + 1,
    }));
    const result = fallbackRecommendation({
      ...baseInput,
      allowedProducts: many,
    });
    expect(result.recommendations).toHaveLength(5);
  });

  it("uses whySuitable as the explanation when available", () => {
    const result = fallbackRecommendation({
      ...baseInput,
      allowedProducts: [
        { name: "Prod A", id: 10, whySuitable: "Perfect for micro business" },
      ],
    });
    expect(result.recommendations[0].explanation).toBe("Perfect for micro business");
  });

  it("constructs a fallback explanation from segment/purpose/highlight", () => {
    const result = fallbackRecommendation({
      ...baseInput,
      allowedProducts: [
        {
          name: "Prod B",
          id: 11,
          segment: "Retail",
          purpose: "Consumption",
          highlight: "Low rate",
        },
      ],
    });
    const explanation = result.recommendations[0].explanation;
    expect(explanation).toContain("Segment: Retail");
    expect(explanation).toContain("Mijoz ehtiyoji: Consumption");
    expect(explanation).toContain("Asosiy afzallik: Low rate");
  });

  it("uses Russian fallback explanation when language is ru", () => {
    const result = fallbackRecommendation({
      ...baseInput,
      language: "ru",
      allowedProducts: [
        { name: "Prod C", id: 12, segment: "МСБ", purpose: "Оборотка" },
      ],
    });
    const explanation = result.recommendations[0].explanation;
    expect(explanation).toContain("Сегмент: МСБ");
    expect(explanation).toContain("Потребность клиента: Оборотка");
  });

  it("uses a generic Uzbek fallback when no detail fields are present", () => {
    const result = fallbackRecommendation({
      ...baseInput,
      language: "uz",
      allowedProducts: [{ name: "Bare Product", id: 99 }],
    });
    expect(result.recommendations[0].explanation).toContain(
      "ruxsat etilgan katalogdan tanlandi",
    );
  });

  it("populates localized fields from the product data", () => {
    const result = fallbackRecommendation(baseInput);
    const first = result.recommendations[0];
    expect(first.localizedSegment).toBe("SME");
    expect(first.localizedPurpose).toBe("Aylanma mablag'");
    expect(first.localizedHighlight).toBe("Tez");
    expect(first.localizedLoanAmount).toBe("100M-1B");
    expect(first.localizedRate).toBe("24%");
    expect(first.localizedGracePeriod).toBeNull();
  });

  it("returns empty recommendations for an empty allowedProducts list", () => {
    const result = fallbackRecommendation({
      ...baseInput,
      allowedProducts: [],
    });
    expect(result.recommendations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// fallbackAutoExtractionFromOcr — plate regex
// ---------------------------------------------------------------------------

describe("fallbackAutoExtractionFromOcr — plate extraction", () => {
  it("extracts Uzbekistan-style plate 01A123AA", () => {
    const result = fallbackAutoExtractionFromOcr("Vehicle plate is 01A123AA registered");
    expect(result.plateText).toBe("01A123AA");
  });

  it("extracts a spaced plate pattern like AB 12 CD", () => {
    const result = fallbackAutoExtractionFromOcr("Plate: AB 12 CD seen on the road");
    expect(result.plateText).toBe("AB 12 CD");
  });

  it("returns null plateText when no plate is found", () => {
    const result = fallbackAutoExtractionFromOcr("No plate information here 12345");
    expect(result.plateText).toBeNull();
  });

  it("returns null plateText for undefined/null ocrText", () => {
    expect(fallbackAutoExtractionFromOcr(undefined).plateText).toBeNull();
    expect(fallbackAutoExtractionFromOcr(null).plateText).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fallbackAutoExtractionFromOcr — year regex
// ---------------------------------------------------------------------------

describe("fallbackAutoExtractionFromOcr — year extraction", () => {
  it("extracts a modern year (2024)", () => {
    const result = fallbackAutoExtractionFromOcr("Manufactured in 2024 model year");
    expect(result.approximateYear).toBe("2024");
  });

  it("extracts a 1990s year (1998)", () => {
    const result = fallbackAutoExtractionFromOcr("First registered 1998");
    expect(result.approximateYear).toBe("1998");
  });

  it("extracts 2031 — regex allows any 20XX year", () => {
    const result = fallbackAutoExtractionFromOcr("Year on doc: 2031");
    expect(result.approximateYear).toBe("2031");
  });

  it("returns null when no 4-digit year is present", () => {
    const result = fallbackAutoExtractionFromOcr("No year info 99 or 123");
    expect(result.approximateYear).toBeNull();
  });

  it("returns null year for empty OCR text", () => {
    const result = fallbackAutoExtractionFromOcr("");
    expect(result.approximateYear).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fallbackAutoExtractionFromOcr — general response shape
// ---------------------------------------------------------------------------

describe("fallbackAutoExtractionFromOcr — response shape", () => {
  it("returns a valid AiExtractAutoResponse with confidence 0.2", () => {
    const result = fallbackAutoExtractionFromOcr("Some text 01B456CD year 2020");
    expect(result.confidence).toBe(0.2);
    expect(result.make).toBeNull();
    expect(result.model).toBeNull();
    expect(result.vehicleType).toBeNull();
    expect(result.color).toBeNull();
    expect(result.visibleConditionNotes).toBeNull();
  });

  it("truncates rawNotes to 400 characters", () => {
    const longText = "A".repeat(500);
    const result = fallbackAutoExtractionFromOcr(longText);
    expect(result.rawNotes).toHaveLength(400);
  });

  it("sets rawNotes to null when ocrText is not provided", () => {
    const result = fallbackAutoExtractionFromOcr(undefined);
    expect(result.rawNotes).toBeNull();
  });

  it("sets rawNotes to the full text when shorter than 400 chars", () => {
    const text = "Short OCR text";
    const result = fallbackAutoExtractionFromOcr(text);
    expect(result.rawNotes).toBe(text);
  });
});
