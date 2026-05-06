import { describe, it, expect } from "vitest";
import { generateLeaveBehindPdf } from "../pdf/leave-behind";

describe("generateLeaveBehindPdf", () => {
  it("returns a PDF buffer for a populated client+expert", async () => {
    const buf = await generateLeaveBehindPdf({
      client: { fullName: "Aziz Karimov", businessName: "Tea Trader" },
      expert: { name: "Bobur Tursunov", phone: "+998 90 123-45-67" },
      offer: {
        productName: "Biznes Ekspress",
        purpose: "Aylanma mablag'larni to'ldirish",
        amountUzs: 200_000_000,
        termMonths: 36,
        interestRate: 27,
        monthlyPaymentUzs: 9_000_000,
        currency: "UZS",
      },
      collateral: {
        acceptedValueUzs: 260_000_000,
        coveragePercent: 130,
        maxLoanAmountUzs: 200_000_000,
        resultStatus: "enough",
        items: ["Do'kon (ko'chmas mulk)"],
      },
      branchName: "IPAK YO'LI Chilonzor",
      language: "ru",
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("renders with missing optional fields", async () => {
    const buf = await generateLeaveBehindPdf({
      client: { fullName: "Anonymous" },
      expert: { name: "Bobur", phone: "+998..." },
      offer: null,
      collateral: null,
      branchName: "IPAK YO'LI",
      language: "ru",
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("renders Uzbek locale", async () => {
    const buf = await generateLeaveBehindPdf({
      client: { fullName: "Aziz" },
      expert: { name: "Bobur", phone: "+998..." },
      offer: null,
      collateral: null,
      branchName: "IPAK YO'LI",
      language: "uz",
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
