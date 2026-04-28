import { describe, it, expect } from "vitest";
import { __testing } from "../lib/system-settings";

const { readNumber, COLLATERAL_DEFAULTS } = __testing;

describe("system-settings.readNumber", () => {
  it("returns numeric values verbatim", () => {
    expect(readNumber(1.25, 99)).toBe(1.25);
    expect(readNumber(0, 99)).toBe(0);
    expect(readNumber(-7, 99)).toBe(-7);
  });

  it("parses numeric strings (Drizzle returns numerics as strings)", () => {
    expect(readNumber("1.25", 99)).toBe(1.25);
    expect(readNumber("0.4", 99)).toBe(0.4);
  });

  it("returns the fallback for non-finite values", () => {
    expect(readNumber(Number.NaN, 99)).toBe(99);
    expect(readNumber(Number.POSITIVE_INFINITY, 99)).toBe(99);
    expect(readNumber("not a number", 99)).toBe(99);
    expect(readNumber(null, 99)).toBe(99);
    expect(readNumber(undefined, 99)).toBe(99);
    expect(readNumber({}, 99)).toBe(99);
  });
});

describe("collateral default settings", () => {
  it("matches the v3 spec values", () => {
    // Critical: these defaults are what runs when the system_settings rows
    // are missing. Changing them here is a behavior change.
    expect(COLLATERAL_DEFAULTS.coverageRatio).toBe(1.25);
    expect(COLLATERAL_DEFAULTS.transportAgeThreshold).toBe(7);
    expect(COLLATERAL_DEFAULTS.transportAgeDiscount).toBe(0.4);
  });
});
