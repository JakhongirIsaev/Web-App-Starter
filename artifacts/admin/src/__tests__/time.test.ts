import { describe, it, expect } from "vitest";
import {
  formatAdminFileDate,
  formatAdminFileDateTime,
  formatAdminShortDate,
  formatAdminLongDate,
} from "../lib/time";

// Asia/Tashkent is UTC+5 year-round; tests pin to that and assume the
// underlying Intl.DateTimeFormat is consistent across Node versions.

const FIXED = new Date("2026-04-29T03:30:45Z"); // 2026-04-29 08:30:45 in Tashkent

describe("formatAdminFileDate", () => {
  it("formats as YYYY-MM-DD in Tashkent zone", () => {
    expect(formatAdminFileDate(FIXED)).toBe("2026-04-29");
  });

  it("handles ISO strings", () => {
    expect(formatAdminFileDate("2026-04-29T03:30:00Z")).toBe("2026-04-29");
  });

  it("rolls into next day when UTC time is late evening", () => {
    // 23:00 UTC on 2026-04-28 → 04:00 next day Tashkent
    expect(formatAdminFileDate("2026-04-28T23:00:00Z")).toBe("2026-04-29");
  });
});

describe("formatAdminFileDateTime", () => {
  it("formats as YYYY-MM-DD_HHMMSS in Tashkent zone", () => {
    expect(formatAdminFileDateTime(FIXED)).toBe("2026-04-29_083045");
  });
});

describe("formatAdminShortDate / LongDate", () => {
  it("returns a non-empty string for a known date", () => {
    expect(formatAdminShortDate(FIXED)).not.toBe("");
    expect(formatAdminLongDate(FIXED)).not.toBe("");
  });

  it("handles null / undefined safely", () => {
    expect(typeof formatAdminShortDate(null)).toBe("string");
    expect(typeof formatAdminLongDate(undefined)).toBe("string");
  });
});
