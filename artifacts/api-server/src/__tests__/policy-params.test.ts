import { describe, it, expect } from "vitest";
import { defaultPolicyParams } from "../lib/policy-params";

describe("PolicyParams shape", () => {
  it("default has all required keys", () => {
    const p = defaultPolicyParams();
    expect(p.minCoverageRatio).toBe(1.25);
    expect(p.collateralDiscounts.realEstate).toBe(0.90);
    expect(p.dscrMax).toBe(0.80);
    expect(p.dscrMaxFx).toBe(0.50);
    expect(p.minRatesUzs.micro.le12m).toBe(0.24);
    expect(p.maxTermMonths.workingCapital).toBe(36);
    expect(p.negativeIndustryKeywords).toContain("tobacco");
  });
});
