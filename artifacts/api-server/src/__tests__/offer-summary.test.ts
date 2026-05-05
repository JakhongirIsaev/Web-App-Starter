import { describe, it, expect } from "vitest";
import { renderOfferSummary } from "../lib/offer-summary";

describe("renderOfferSummary", () => {
  it("renders Russian", () => {
    const s = renderOfferSummary(
      {
        clientName: "Иван",
        productName: "Микро-кредит",
        amountUzs: 50_000_000,
        rateUzs: 0.24,
        termMonths: 12,
      },
      "ru",
    );
    expect(s).toContain("Иван");
    expect(s).toContain("Микро-кредит");
    expect(s).toContain("24.0%");
    expect(s).toContain("12 мес.");
  });

  it("renders Uzbek", () => {
    const s = renderOfferSummary(
      {
        clientName: "Aziz",
        productName: "Mikro",
        amountUzs: 50_000_000,
        rateUzs: 0.24,
        termMonths: 12,
      },
      "uz",
    );
    expect(s).toContain("Aziz");
    expect(s).toContain("Mikro");
    expect(s).toContain("24.0%");
    expect(s).toContain("12 oy");
  });

  it("formats large amount with thousand separators", () => {
    const s = renderOfferSummary(
      {
        clientName: "Test",
        productName: "P",
        amountUzs: 1_234_567_890,
        rateUzs: 0.18,
        termMonths: 24,
      },
      "ru",
    );
    expect(s).toContain("18.0%");
    // Either narrow no-break space or regular space depending on Node version,
    // both are acceptable thousand separators.
    expect(s).toMatch(/1[\s  ]234[\s  ]567[\s  ]890/);
  });
});
