import { describe, expect, it } from "vitest";
import { __testing } from "../routes/collateral";

const {
  parseCollateralCurrency,
  validateCollateralItemIds,
  validatePositiveMoney,
} = __testing;

describe("collateral route validation helpers", () => {
  it("defaults collateral currency to UZS and normalizes casing", () => {
    expect(parseCollateralCurrency(undefined)).toBe("UZS");
    expect(parseCollateralCurrency(null)).toBe("UZS");
    expect(parseCollateralCurrency("uzs")).toBe("UZS");
    expect(parseCollateralCurrency(" UZS ")).toBe("UZS");
  });

  it("rejects unsupported collateral currencies", () => {
    expect(parseCollateralCurrency("USD")).toBeNull();
    expect(parseCollateralCurrency("EUR")).toBeNull();
    expect(parseCollateralCurrency("")).toBeNull();
  });

  it("requires at least one collateral item id", () => {
    expect(validateCollateralItemIds([])).toBe("Выберите хотя бы один предмет залога / Kamida bitta garov predmetini tanlang");
  });

  it("rejects non-positive and non-integer collateral item ids", () => {
    expect(validateCollateralItemIds([1, 0])).toBe(
      "Некорректный идентификатор предмета залога / Garov predmeti identifikatori noto'g'ri",
    );
    expect(validateCollateralItemIds([1, 1.5])).toBe(
      "Некорректный идентификатор предмета залога / Garov predmeti identifikatori noto'g'ri",
    );
  });

  it("rejects duplicate collateral item ids", () => {
    expect(validateCollateralItemIds([10, 10])).toBe(
      "Предметы залога не должны повторяться / Garov predmetlari takrorlanmasligi kerak",
    );
  });

  it("accepts unique positive collateral item ids", () => {
    expect(validateCollateralItemIds([10, 11])).toBeNull();
  });

  it("requires positive finite money values", () => {
    expect(validatePositiveMoney(1, "Сумма")).toBeNull();
    expect(validatePositiveMoney(0, "Сумма")).toBe("Сумма должно быть больше 0 / Сумма 0 dan katta bo'lishi kerak");
    expect(validatePositiveMoney(-1, "Сумма")).toBe("Сумма должно быть больше 0 / Сумма 0 dan katta bo'lishi kerak");
    expect(validatePositiveMoney(Number.NaN, "Сумма")).toBe("Сумма должно быть больше 0 / Сумма 0 dan katta bo'lishi kerak");
    expect(validatePositiveMoney(Number.POSITIVE_INFINITY, "Сумма")).toBe(
      "Сумма должно быть больше 0 / Сумма 0 dan katta bo'lishi kerak",
    );
  });
});
