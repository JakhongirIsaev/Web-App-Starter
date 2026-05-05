import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolveBundledFonts } from "../pdf/generate";

describe("resolveBundledFonts", () => {
  it("returns absolute paths to DejaVuSans regular and bold", () => {
    const fonts = resolveBundledFonts();
    expect(fonts.body).toMatch(/DejaVuSans\.ttf$/);
    expect(fonts.bold).toMatch(/DejaVuSans-Bold\.ttf$/);
  });

  it("the resolved font files actually exist on disk", () => {
    const fonts = resolveBundledFonts();
    expect(existsSync(fonts.body)).toBe(true);
    expect(existsSync(fonts.bold)).toBe(true);
  });
});
