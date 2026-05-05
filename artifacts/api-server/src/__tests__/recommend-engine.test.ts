import { describe, it, expect } from "vitest";
import { recommendProducts } from "../lib/recommend-engine";
import { defaultPolicyParams } from "../lib/policy-params";

const params = defaultPolicyParams();

describe("recommendProducts", () => {
  it("returns micro UZS rate >= minRate for amount/term", () => {
    const products = [
      { id: 1, segment: "micro" as const, currency: "UZS" as const, purpose: "working_capital", minRate: 0.24, maxRate: 0.30, maxTermMonths: 36 },
      { id: 2, segment: "micro" as const, currency: "UZS" as const, purpose: "working_capital", minRate: 0.10, maxRate: 0.15, maxTermMonths: 12 },
      { id: 3, segment: "small" as const, currency: "UZS" as const, purpose: "working_capital", minRate: 0.24, maxRate: 0.28, maxTermMonths: 36 },
    ];
    const res = recommendProducts({
      products,
      params,
      client: { segment: "micro", currency: "UZS", purpose: "working_capital", desiredAmountUzs: 100_000_000, desiredTermMonths: 12 },
    });
    expect(res.map((p) => p.id)).toEqual([1]);
  });

  it("rejects negative-industry purposes", () => {
    const products = [{ id: 1, segment: "micro" as const, currency: "UZS" as const, purpose: "tobacco", minRate: 0.30, maxRate: 0.40, maxTermMonths: 12 }];
    const res = recommendProducts({
      products,
      params,
      client: { segment: "micro", currency: "UZS", purpose: "tobacco", desiredAmountUzs: 50_000_000, desiredTermMonths: 12 },
    });
    expect(res).toEqual([]);
  });

  it("excludes terms over the segment cap", () => {
    const products = [{ id: 1, segment: "micro" as const, currency: "UZS" as const, purpose: "working_capital", minRate: 0.24, maxRate: 0.30, maxTermMonths: 60 }];
    const res = recommendProducts({
      products,
      params,
      client: { segment: "micro", currency: "UZS", purpose: "working_capital", desiredAmountUzs: 50_000_000, desiredTermMonths: 48 },
    });
    expect(res).toEqual([]);
  });

  it("uses small segment >12m rate when term >12 months", () => {
    const products = [
      { id: 1, segment: "small" as const, currency: "UZS" as const, purpose: "working_capital", minRate: 0.24, maxRate: 0.30, maxTermMonths: 36 },
      { id: 2, segment: "small" as const, currency: "UZS" as const, purpose: "working_capital", minRate: 0.25, maxRate: 0.30, maxTermMonths: 36 },
    ];
    const res = recommendProducts({
      products,
      params,
      client: { segment: "small", currency: "UZS", purpose: "working_capital", desiredAmountUzs: 100_000_000, desiredTermMonths: 24 },
    });
    expect(res.map((p) => p.id)).toEqual([2]);
  });

  it("sorts cheapest first", () => {
    const products = [
      { id: 1, segment: "micro" as const, currency: "UZS" as const, purpose: "working_capital", minRate: 0.30, maxRate: 0.40, maxTermMonths: 12 },
      { id: 2, segment: "micro" as const, currency: "UZS" as const, purpose: "working_capital", minRate: 0.24, maxRate: 0.30, maxTermMonths: 12 },
      { id: 3, segment: "micro" as const, currency: "UZS" as const, purpose: "working_capital", minRate: 0.26, maxRate: 0.32, maxTermMonths: 12 },
    ];
    const res = recommendProducts({
      products,
      params,
      client: { segment: "micro", currency: "UZS", purpose: "working_capital", desiredAmountUzs: 50_000_000, desiredTermMonths: 12 },
    });
    expect(res.map((p) => p.id)).toEqual([2, 3, 1]);
  });
});
