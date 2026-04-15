import { describe, it, expect } from "vitest";
import {
  MiniAppCreateClientBody,
  MiniAppUpdateClientBody,
  DESIRED_AMOUNT_MIN,
  DESIRED_AMOUNT_MAX,
} from "@workspace/api-zod";

describe("desiredAmount validation (server-side)", () => {
  it("accepts undefined (field is optional)", () => {
    expect(MiniAppCreateClientBody.safeParse({}).success).toBe(true);
    expect(MiniAppUpdateClientBody.safeParse({}).success).toBe(true);
  });

  it("accepts empty string", () => {
    expect(MiniAppCreateClientBody.safeParse({ desiredAmount: "" }).success).toBe(true);
  });

  it("accepts value at the minimum", () => {
    const r = MiniAppCreateClientBody.safeParse({ desiredAmount: String(DESIRED_AMOUNT_MIN) });
    expect(r.success).toBe(true);
  });

  it("accepts value at the maximum", () => {
    const r = MiniAppCreateClientBody.safeParse({ desiredAmount: String(DESIRED_AMOUNT_MAX) });
    expect(r.success).toBe(true);
  });

  it("accepts space-separated thousands (UI format)", () => {
    const r = MiniAppCreateClientBody.safeParse({ desiredAmount: "1 000 000" });
    expect(r.success).toBe(true);
  });

  it("accepts comma-separated thousands", () => {
    const r = MiniAppCreateClientBody.safeParse({ desiredAmount: "1,000,000" });
    expect(r.success).toBe(true);
  });

  it("rejects below minimum", () => {
    const r = MiniAppCreateClientBody.safeParse({ desiredAmount: "999999" });
    expect(r.success).toBe(false);
  });

  it("rejects above maximum", () => {
    const r = MiniAppCreateClientBody.safeParse({
      desiredAmount: String(DESIRED_AMOUNT_MAX + 1),
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(MiniAppCreateClientBody.safeParse({ desiredAmount: "abc" }).success).toBe(false);
    expect(MiniAppCreateClientBody.safeParse({ desiredAmount: "1.5" }).success).toBe(false);
    expect(MiniAppCreateClientBody.safeParse({ desiredAmount: "-1000000" }).success).toBe(false);
  });

  it("applies the same rule to update body", () => {
    expect(MiniAppUpdateClientBody.safeParse({ desiredAmount: "500" }).success).toBe(false);
    expect(MiniAppUpdateClientBody.safeParse({ desiredAmount: "5000000" }).success).toBe(true);
  });
});
