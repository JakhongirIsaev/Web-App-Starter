import { describe, it, expect } from "vitest";
import {
  localizePurpose,
  localizeHighlight,
  localizeDisbursement,
  localizeMonthsField,
} from "../lib/localize";

// All localizers take Russian source text and translate when lang === "uz",
// otherwise pass through. Empty / nullish input always returns "".

describe("localize* — null and pass-through", () => {
  it("returns empty string for nullish input", () => {
    expect(localizePurpose(null, "uz")).toBe("");
    expect(localizePurpose(undefined, "uz")).toBe("");
    expect(localizePurpose("", "uz")).toBe("");
  });

  it("returns text unchanged when lang is not 'uz'", () => {
    expect(localizePurpose("Любой текст", "ru")).toBe("Любой текст");
    expect(localizeHighlight("Любой текст", "en")).toBe("Любой текст");
  });
});

describe("localizeMonthsField", () => {
  it("translates 'месяцев' phrasings into Uzbek", () => {
    const out = localizeMonthsField("12 месяцев", "uz");
    // Should contain "oy" (Uzbek for month) somewhere
    expect(out.toLowerCase()).toContain("oy");
  });

  it("returns ru text unchanged for non-uz lang", () => {
    expect(localizeMonthsField("12 месяцев", "ru")).toBe("12 месяцев");
  });
});

describe("localizePurpose / Highlight / Disbursement", () => {
  it("returns text for unknown keys (no translation in dictionary)", () => {
    // An unrecognized purpose should still come back as a non-empty string
    // (passes through the months localizer fallback)
    expect(localizePurpose("Какая-то незнакомая цель", "uz")).not.toBe("");
  });

  it("preserves the same text for unrecognized + non-uz", () => {
    expect(localizePurpose("Unknown purpose", "ru")).toBe("Unknown purpose");
  });
});
