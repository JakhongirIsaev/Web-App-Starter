import { describe, it, expect } from "vitest";
import { generateLeaveBehindPdf } from "../pdf/leave-behind";

describe("generateLeaveBehindPdf", () => {
  it("returns a PDF buffer for a populated client+expert", async () => {
    const buf = await generateLeaveBehindPdf({
      client: { fullName: "Aziz Karimov", businessName: "Tea Trader" },
      expert: { name: "Bobur Tursunov", phone: "+998 90 123-45-67" },
      indicative: {
        amountMinUzs: 50_000_000,
        amountMaxUzs: 200_000_000,
        monthlyMinUzs: 2_500_000,
        monthlyMaxUzs: 9_000_000,
        currency: "UZS",
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
      indicative: null,
      branchName: "IPAK YO'LI",
      language: "ru",
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("renders Uzbek locale", async () => {
    const buf = await generateLeaveBehindPdf({
      client: { fullName: "Aziz" },
      expert: { name: "Bobur", phone: "+998..." },
      indicative: null,
      branchName: "IPAK YO'LI",
      language: "uz",
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
