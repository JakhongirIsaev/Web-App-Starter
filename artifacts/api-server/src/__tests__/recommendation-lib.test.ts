import { describe, it, expect } from "vitest";
import {
  buildClientPreferenceProfile,
  summarizeClientPreferences,
  getRelevantTerm,
  getRateSummary,
  isCreditNeedType,
  isNonCreditNeedType,
  buildRecommendationNote,
} from "../lib/recommendation";
import type {
  QuestionnaireAnswer,
  ProductLike,
  ClientPreferenceProfile,
} from "../lib/recommendation";

function answer(questionKey: string, ans: string): QuestionnaireAnswer {
  return { questionKey, answer: ans };
}

function product(overrides: Partial<ProductLike> = {}): ProductLike {
  return { name: "Test Product", ...overrides };
}

// ---------------------------------------------------------------------------
// buildClientPreferenceProfile
// ---------------------------------------------------------------------------

describe("buildClientPreferenceProfile", () => {
  it("returns empty labels for empty answers", () => {
    const profile = buildClientPreferenceProfile([], "uz");
    expect(profile.businessType).toBeUndefined();
    expect(profile.businessTypeLabel).toBeUndefined();
    expect(profile.needType).toBeUndefined();
  });

  it("returns empty labels when called with no arguments", () => {
    const profile = buildClientPreferenceProfile();
    expect(profile.businessType).toBeUndefined();
    expect(profile.loanPurpose).toBeUndefined();
  });

  it("maps a full set of answers to Uzbek labels", () => {
    const answers = [
      answer("business_type", "trade"),
      answer("business_size", "small"),
      answer("need_type", "credit"),
      answer("loan_purpose", "working_capital"),
      answer("desired_amount", "500000000"),
      answer("desired_term", "36"),
      answer("preferred_currency", "uzs"),
      answer("monthly_payment_comfort", "up_to_10m"),
      answer("repayment_preference", "annuity"),
      answer("down_payment_level", "up_to_20"),
      answer("needs_grace_period", "yes"),
    ];
    const profile = buildClientPreferenceProfile(answers, "uz");

    expect(profile.businessType).toBe("trade");
    expect(profile.businessTypeLabel).toBe("Savdo");
    expect(profile.businessSize).toBe("small");
    expect(profile.businessSizeLabel).toBe("Kichik biznes");
    expect(profile.needType).toBe("credit");
    expect(profile.needTypeLabel).toBe("Kredit mahsuloti");
    expect(profile.loanPurpose).toBe("working_capital");
    expect(profile.loanPurposeLabel).toBe("Aylanma mablag'ni to'ldirish");
    expect(profile.desiredAmount).toBe("500000000");
    expect(profile.desiredTerm).toBe("36");
    expect(profile.preferredCurrency).toBe("uzs");
    expect(profile.preferredCurrencyLabel).toBe("So'm");
    expect(profile.monthlyPaymentComfort).toBe("up_to_10m");
    expect(profile.monthlyPaymentComfortLabel).toBe("10 mln so'mgacha");
    expect(profile.repaymentPreference).toBe("annuity");
    expect(profile.repaymentPreferenceLabel).toBe("Har oy bir xil to'lov");
    expect(profile.downPaymentLevel).toBe("up_to_20");
    expect(profile.downPaymentLevelLabel).toBe("20% gacha");
    expect(profile.needsGracePeriod).toBe("yes");
    expect(profile.needsGracePeriodLabel).toBe("Ha");
  });

  it("maps answers to Russian labels", () => {
    const answers = [
      answer("business_type", "production"),
      answer("business_size", "medium"),
      answer("need_type", "both"),
      answer("loan_purpose", "fixed_assets"),
    ];
    const profile = buildClientPreferenceProfile(answers, "ru");

    expect(profile.businessTypeLabel).toBe("Производство");
    expect(profile.businessSizeLabel).toBe("Средний бизнес");
    expect(profile.needTypeLabel).toBe("Кредит и дополнительные банковские продукты");
    expect(profile.loanPurposeLabel).toBe("Приобретение основных средств");
  });

  it("falls back to the raw value for unknown keys", () => {
    const answers = [answer("business_type", "fintech_startup")];
    const profile = buildClientPreferenceProfile(answers, "uz");

    expect(profile.businessType).toBe("fintech_startup");
    expect(profile.businessTypeLabel).toBe("fintech_startup");
  });

  it("handles partial answers (some keys present, others missing)", () => {
    const answers = [
      answer("business_type", "agriculture"),
      answer("desired_amount", "100000"),
    ];
    const profile = buildClientPreferenceProfile(answers, "ru");

    expect(profile.businessTypeLabel).toBe("Сельское хозяйство");
    expect(profile.desiredAmount).toBe("100000");
    expect(profile.businessSize).toBeUndefined();
    expect(profile.businessSizeLabel).toBeUndefined();
    expect(profile.loanPurpose).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// summarizeClientPreferences
// ---------------------------------------------------------------------------

describe("summarizeClientPreferences", () => {
  it("returns an empty array for a profile with no labels", () => {
    const summary = summarizeClientPreferences({}, "ru");
    expect(summary).toEqual([]);
  });

  it("produces Russian labels from a populated profile", () => {
    const profile = buildClientPreferenceProfile(
      [
        answer("business_type", "services"),
        answer("business_size", "micro"),
        answer("desired_term", "12"),
      ],
      "ru",
    );
    const summary = summarizeClientPreferences(profile, "ru");

    expect(summary).toContainEqual({ label: "Тип бизнеса", value: "Услуги" });
    expect(summary).toContainEqual({ label: "Размер бизнеса", value: "Микробизнес" });
    expect(summary).toContainEqual({ label: "Нужный срок", value: "12 мес." });
  });

  it("produces Uzbek labels from a populated profile", () => {
    const profile = buildClientPreferenceProfile(
      [
        answer("business_type", "trade"),
        answer("desired_term", "24"),
        answer("preferred_currency", "usd"),
      ],
      "uz",
    );
    const summary = summarizeClientPreferences(profile, "uz");

    expect(summary).toContainEqual({ label: "Biznes turi", value: "Savdo" });
    expect(summary).toContainEqual({ label: "Kerakli muddat", value: "24 oy" });
    expect(summary).toContainEqual({ label: "Valyuta", value: "AQSh dollari" });
  });

  it("omits entries whose label value is undefined", () => {
    const profile: ClientPreferenceProfile = {
      businessTypeLabel: "Savdo",
      desiredAmount: "100000",
      // no desiredTerm, so no term entry
    };
    const summary = summarizeClientPreferences(profile, "uz");
    const keys = summary.map((s) => s.label);
    expect(keys).toContain("Biznes turi");
    expect(keys).toContain("Kerakli summa");
    expect(keys).not.toContain("Kerakli muddat");
  });
});

// ---------------------------------------------------------------------------
// getRelevantTerm
// ---------------------------------------------------------------------------

describe("getRelevantTerm", () => {
  it("returns termWorkingCapital when loanPurpose is working_capital", () => {
    expect(
      getRelevantTerm(product({ termWorkingCapital: "12-36 months" }), "working_capital"),
    ).toBe("12-36 months");
  });

  it("returns termFixedAssets when loanPurpose is fixed_assets", () => {
    expect(
      getRelevantTerm(product({ termFixedAssets: "24-60 months" }), "fixed_assets"),
    ).toBe("24-60 months");
  });

  it("returns termUntargeted when loanPurpose is untargeted", () => {
    expect(
      getRelevantTerm(product({ termUntargeted: "6-12 months" }), "untargeted"),
    ).toBe("6-12 months");
  });

  it("returns the first available term when loanPurpose is not_sure", () => {
    const p = product({
      termWorkingCapital: "12 months",
      termFixedAssets: "36 months",
    });
    expect(getRelevantTerm(p, "not_sure")).toBe("12 months");
  });

  it("returns the first available term when loanPurpose is undefined", () => {
    const p = product({ termFixedAssets: "48 months" });
    expect(getRelevantTerm(p, undefined)).toBe("48 months");
  });

  it("returns null when no terms are set", () => {
    expect(getRelevantTerm(product(), "working_capital")).toBeNull();
    expect(getRelevantTerm(product(), undefined)).toBeNull();
  });

  it("falls back through available terms when the specific one is missing", () => {
    const p = product({ termUntargeted: "6 months" });
    // loanPurpose is working_capital, but termWorkingCapital is not set
    expect(getRelevantTerm(p, "working_capital")).toBe("6 months");
  });
});

// ---------------------------------------------------------------------------
// getRateSummary
// ---------------------------------------------------------------------------

describe("getRateSummary", () => {
  it("returns null when all rates are null/undefined", () => {
    expect(getRateSummary(product())).toBeNull();
    expect(getRateSummary(product({ rateUZS: null, rateUSD: null, rateEUR: null }))).toBeNull();
  });

  it("returns a single rate", () => {
    expect(getRateSummary(product({ rateUZS: "24%" }))).toBe("UZS: 24%");
  });

  it("joins multiple rates with pipe separator", () => {
    const p = product({ rateUZS: "24%", rateUSD: "12%", rateEUR: "10%" });
    expect(getRateSummary(p)).toBe("UZS: 24% | USD: 12% | EUR: 10%");
  });

  it("skips null rates in the summary", () => {
    const p = product({ rateUZS: "24%", rateUSD: null, rateEUR: "10%" });
    expect(getRateSummary(p)).toBe("UZS: 24% | EUR: 10%");
  });
});

// ---------------------------------------------------------------------------
// isCreditNeedType / isNonCreditNeedType
// ---------------------------------------------------------------------------

describe("isCreditNeedType", () => {
  it("returns true for undefined (default)", () => {
    expect(isCreditNeedType(undefined)).toBe(true);
  });

  it('returns true for "credit"', () => {
    expect(isCreditNeedType("credit")).toBe(true);
  });

  it('returns true for "both"', () => {
    expect(isCreditNeedType("both")).toBe(true);
  });

  it('returns false for "non_credit"', () => {
    expect(isCreditNeedType("non_credit")).toBe(false);
  });

  it("returns false for unknown string", () => {
    expect(isCreditNeedType("something_else")).toBe(false);
  });
});

describe("isNonCreditNeedType", () => {
  it('returns true for "non_credit"', () => {
    expect(isNonCreditNeedType("non_credit")).toBe(true);
  });

  it('returns true for "both"', () => {
    expect(isNonCreditNeedType("both")).toBe(true);
  });

  it('returns false for "credit"', () => {
    expect(isNonCreditNeedType("credit")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isNonCreditNeedType(undefined)).toBe(false);
  });

  it("returns false for unknown string", () => {
    expect(isNonCreditNeedType("other")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildRecommendationNote
// ---------------------------------------------------------------------------

describe("buildRecommendationNote", () => {
  it("produces a fallback note in Uzbek when profile and product have no detail", () => {
    const note = buildRecommendationNote(product(), {}, "uz");
    expect(note).toContain("Mahsulot mijozning anketa javoblari");
  });

  it("produces a fallback note in Russian when profile and product have no detail", () => {
    const note = buildRecommendationNote(product(), {}, "ru");
    expect(note).toContain("Продукт добавлен на основе анкеты клиента");
  });

  it("includes need type reason in Russian", () => {
    const profile: ClientPreferenceProfile = {
      needType: "credit",
      needTypeLabel: "Кредитный продукт",
    };
    const note = buildRecommendationNote(product(), profile, "ru");
    expect(note).toContain("основная потребность клиента");
    expect(note).toContain("кредитный продукт");
  });

  it("includes segment + business size reason", () => {
    const p = product({ segment: "SME" });
    const profile: ClientPreferenceProfile = {
      businessSize: "small",
      businessSizeLabel: "Малый бизнес",
    };
    const note = buildRecommendationNote(p, profile, "ru");
    expect(note).toContain("Сегмент продукта");
    expect(note).toContain("SME");
    expect(note).toContain("малый бизнес");
  });

  it("includes loan purpose when product matches", () => {
    const p = product({ termWorkingCapital: "12-36 months" });
    const profile: ClientPreferenceProfile = {
      loanPurpose: "working_capital",
      loanPurposeLabel: "Aylanma mablag'ni to'ldirish",
    };
    const note = buildRecommendationNote(p, profile, "uz");
    expect(note).toContain("yo'nalishi");
    expect(note).toContain("aylanma mablag'ni to'ldirish");
  });

  it("includes amount and term lines when present", () => {
    const p = product({
      loanAmount: "500M-5B",
      termWorkingCapital: "12-36 months",
    });
    const profile: ClientPreferenceProfile = {
      desiredAmount: "1000000000",
      desiredTerm: "24",
      loanPurpose: "working_capital",
    };
    const note = buildRecommendationNote(p, profile, "ru");
    expect(note).toContain("Запрошенная сумма");
    expect(note).toContain("Желаемый срок");
  });

  it("includes disbursement and highlight", () => {
    const p = product({
      disbursementForm: "Наличные",
      highlight: "Без залога",
    });
    const note = buildRecommendationNote(p, {}, "ru");
    expect(note).toContain("Форма выдачи: Наличные");
    expect(note).toContain("Ключевое преимущество: Без залога");
  });

  it("joins all reasons into a single string", () => {
    const p = product({
      segment: "Mikro",
      disbursementForm: "Karta",
      highlight: "Tez",
    });
    const profile: ClientPreferenceProfile = {
      needType: "credit",
      needTypeLabel: "Kredit mahsuloti",
      businessSize: "micro",
      businessSizeLabel: "Mikro biznes",
    };
    const note = buildRecommendationNote(p, profile, "uz");
    // Multiple sentences, joined by spaces
    expect(note.split(". ").length).toBeGreaterThanOrEqual(3);
  });
});
