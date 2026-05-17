import { describe, it, expect } from "vitest";
import { formatUzs, roundMoney } from "../lib/money";

describe("roundMoney", () => {
  it("rounds half-up to 2 decimals", () => {
    expect(roundMoney(1.005)).toBe(1.01);
  });

  it("returns 0 for 0", () => {
    expect(roundMoney(0)).toBe(0);
  });

  it("preserves already-rounded values", () => {
    expect(roundMoney(123.45)).toBe(123.45);
  });

  it("rounds typical fractional currency values", () => {
    expect(roundMoney(99.999)).toBe(100);
    expect(roundMoney(50.124)).toBe(50.12);
    expect(roundMoney(50.125)).toBe(50.13);
  });

  it("returns 0 for non-finite inputs", () => {
    expect(roundMoney(Number.NaN)).toBe(0);
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0);
    expect(roundMoney(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("formatUzs", () => {
  it("returns ru-RU thousands-separated form", () => {
    // ru-RU uses a non-breaking thousands separator on modern ICU builds and
    // a regular space on older ones -- accept either.
    expect(formatUzs(1234567)).toMatch(/^1[\s\u00A0\u202F]234[\s\u00A0\u202F]567$/);
  });

  it("returns \"\" for null and undefined", () => {
    // Documented behaviour: empty string so callers can render their own dash.
    expect(formatUzs(null)).toBe("");
    expect(formatUzs(undefined)).toBe("");
  });

  it("returns \"\" for non-finite numbers", () => {
    expect(formatUzs(Number.NaN)).toBe("");
    expect(formatUzs(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("appends UZS when withSymbol is true", () => {
    const out = formatUzs(1234, { withSymbol: true });
    expect(out.endsWith(" UZS")).toBe(true);
  });

  it("rounds to no fractional digits", () => {
    // 12.4 -> "12", 12.6 -> "13" (ICU rounds half-to-even but for 0.4/0.6 the
    // result is unambiguous).
    expect(formatUzs(12.4)).toBe("12");
    expect(formatUzs(12.6)).toBe("13");
  });

  it("formats bigint values", () => {
    const out = formatUzs(123456789n);
    expect(out).toMatch(/^123[\s\u00A0\u202F]456[\s\u00A0\u202F]789$/);
  });

  it("formats 0 as \"0\"", () => {
    expect(formatUzs(0)).toBe("0");
  });
});
