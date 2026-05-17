import { describe, it, expect } from "vitest";
import {
  validateStir,
  validatePassport,
  validateUzPhone,
  validateExtractedData,
} from "../lib/uz-doc-validation";

describe("validateStir", () => {
  it("accepts 9 digits", () => {
    expect(validateStir("123456789")).toEqual({ valid: true, normalized: "123456789" });
  });

  it("strips whitespace", () => {
    expect(validateStir("  123 456 789  ")).toEqual({ valid: true, normalized: "123456789" });
  });

  it("rejects shorter strings", () => {
    expect(validateStir("12345").valid).toBe(false);
  });

  it("rejects letters", () => {
    expect(validateStir("12345678A").valid).toBe(false);
  });

  it("rejects empty", () => {
    expect(validateStir("").valid).toBe(false);
    expect(validateStir(null).valid).toBe(false);
  });
});

describe("validatePassport", () => {
  it("accepts AA1234567 (Latin)", () => {
    expect(validatePassport("AA1234567").valid).toBe(true);
  });

  it("accepts АА1234567 (Cyrillic)", () => {
    expect(validatePassport("АА1234567").valid).toBe(true);
  });

  it("normalizes lowercase to uppercase", () => {
    expect(validatePassport("aa1234567")).toMatchObject({ valid: true, normalized: "AA1234567" });
  });

  it("rejects mixed scripts", () => {
    expect(validatePassport("АA1234567").valid).toBe(false); // Cyr + Lat mix
  });

  it("rejects wrong digit count", () => {
    expect(validatePassport("AA12345").valid).toBe(false);
    expect(validatePassport("AA12345678").valid).toBe(false);
  });
});

describe("validateUzPhone", () => {
  it("accepts +998XXXXXXXXX", () => {
    expect(validateUzPhone("+998901234567")).toMatchObject({ valid: true, normalized: "+998901234567" });
  });

  it("accepts 998XXXXXXXXX without plus", () => {
    expect(validateUzPhone("998901234567").normalized).toBe("+998901234567");
  });

  it("accepts 9-digit local form (no country code)", () => {
    expect(validateUzPhone("901234567").normalized).toBe("+998901234567");
  });

  it("accepts 0XXXXXXXXX local form", () => {
    expect(validateUzPhone("0901234567").normalized).toBe("+998901234567");
  });

  it("strips whitespace, dashes, parens", () => {
    expect(validateUzPhone("+998 (90) 123-45-67").normalized).toBe("+998901234567");
  });

  it("rejects too short", () => {
    expect(validateUzPhone("12345").valid).toBe(false);
  });

  it("rejects non-UZ country code", () => {
    expect(validateUzPhone("+1234567890123").valid).toBe(false);
  });

  it("rejects letters", () => {
    expect(validateUzPhone("+998ABC234567").valid).toBe(false);
  });
});

describe("validateExtractedData", () => {
  it("normalizes valid fields", () => {
    const result = validateExtractedData({
      inn: "  123 456 789 ",
      passportNumber: "aa1234567",
      phone: "+998 (90) 123-45-67",
      fullName: "Иван Иванов",
    });
    expect(result.sanitized.inn).toBe("123456789");
    expect(result.sanitized.passportNumber).toBe("AA1234567");
    expect(result.sanitized.phone).toBe("+998901234567");
    expect(result.sanitized.fullName).toBe("Иван Иванов"); // unchanged
    expect(result.invalidFields).toEqual([]);
  });

  it("flags malformed fields without dropping them", () => {
    const result = validateExtractedData({
      inn: "12345",
      passportNumber: "BAD",
      phone: "broken",
    });
    expect(result.invalidFields).toContain("inn");
    expect(result.invalidFields).toContain("passportNumber");
    expect(result.invalidFields).toContain("phone");
    // Originals retained for the UI to display the raw OCR value.
    expect(result.sanitized.inn).toBe("12345");
  });

  it("ignores non-string values", () => {
    expect(validateExtractedData({ inn: 12345, phone: null }).invalidFields).toEqual([]);
  });

  it("handles null input", () => {
    expect(validateExtractedData(null)).toEqual({ sanitized: {}, invalidFields: [] });
  });
});
