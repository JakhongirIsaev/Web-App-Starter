// Schema-level validation tests for the mini-app body schemas Codex added in
// 4db5cc5. Each schema is parsed with safeParse — these tests guarantee the
// validation layer rejects invalid payloads before the route handler runs,
// so the IDOR / cross-client tests in client-access.test.ts can assume the
// shape they receive is well-formed.
import { describe, it, expect } from "vitest";
import {
  MiniAppCreateClientBody,
  MiniAppUpdateClientBody,
  MiniAppNoteBody,
  MiniAppNextActionBody,
  MiniAppDocumentBody,
  MiniAppCalculateBody,
  MiniAppRecommendBody,
  MiniAppBasketBody,
  MiniAppGeneratePdfBody,
} from "@workspace/api-zod";

describe("MiniAppCreateClientBody", () => {
  it("accepts a minimal payload (all optional)", () => {
    const r = MiniAppCreateClientBody.safeParse({});
    expect(r.success).toBe(true);
  });

  it("rejects empty fullName when provided", () => {
    const r = MiniAppCreateClientBody.safeParse({ fullName: "" });
    expect(r.success).toBe(false);
  });

  it("accepts nullable optional identity fields from lead forms", () => {
    const r = MiniAppCreateClientBody.safeParse({
      fullName: null,
      phone: null,
      telegramUsername: null,
      legalName: null,
    });
    expect(r.success).toBe(true);
  });
});

describe("MiniAppUpdateClientBody", () => {
  it("accepts a status from the enum", () => {
    const r = MiniAppUpdateClientBody.safeParse({ status: "draft" });
    expect(r.success).toBe(true);
  });

  it("rejects an arbitrary status", () => {
    const r = MiniAppUpdateClientBody.safeParse({ status: "frozen" });
    expect(r.success).toBe(false);
  });

  it("rejects out-of-range latitude", () => {
    const r = MiniAppUpdateClientBody.safeParse({ latitude: 100, longitude: 60 });
    expect(r.success).toBe(false);
  });

  it("accepts in-range geo", () => {
    const r = MiniAppUpdateClientBody.safeParse({ latitude: 41.31, longitude: 69.24 });
    expect(r.success).toBe(true);
  });

  it("accepts gender / clientType from enums", () => {
    const r = MiniAppUpdateClientBody.safeParse({ gender: "female", clientType: "individual" });
    expect(r.success).toBe(true);
  });

  it("rejects invalid gender", () => {
    const r = MiniAppUpdateClientBody.safeParse({ gender: "other" });
    expect(r.success).toBe(false);
  });
});

describe("MiniAppNoteBody", () => {
  it("requires non-empty content", () => {
    expect(MiniAppNoteBody.safeParse({ content: "" }).success).toBe(false);
    expect(MiniAppNoteBody.safeParse({}).success).toBe(false);
  });

  it("accepts content with optional type", () => {
    expect(MiniAppNoteBody.safeParse({ content: "hello" }).success).toBe(true);
    expect(MiniAppNoteBody.safeParse({ content: "hello", type: "follow_up" }).success).toBe(true);
  });
});

describe("MiniAppNextActionBody", () => {
  it("requires actionType + actionDate", () => {
    expect(MiniAppNextActionBody.safeParse({ actionType: "call" }).success).toBe(false);
    expect(MiniAppNextActionBody.safeParse({ actionDate: "2026-04-29" }).success).toBe(false);
    expect(
      MiniAppNextActionBody.safeParse({ actionType: "call", actionDate: "2026-04-29" }).success,
    ).toBe(true);
  });

  it("rejects priority outside the enum", () => {
    const r = MiniAppNextActionBody.safeParse({
      actionType: "call",
      actionDate: "2026-04-29",
      priority: "urgent",
    });
    expect(r.success).toBe(false);
  });
});

describe("MiniAppDocumentBody", () => {
  it("requires fileName + storagePath", () => {
    expect(MiniAppDocumentBody.safeParse({ fileName: "" }).success).toBe(false);
    expect(MiniAppDocumentBody.safeParse({ storagePath: "" }).success).toBe(false);
  });

  it("accepts a complete payload", () => {
    const r = MiniAppDocumentBody.safeParse({
      fileName: "passport.jpg",
      storagePath: "/local-objects/docs/abc.jpg",
      docType: "passport",
    });
    expect(r.success).toBe(true);
  });
});

describe("MiniAppCalculateBody", () => {
  it("accepts a calculation request", () => {
    const r = MiniAppCalculateBody.safeParse({
      clientId: 42,
      productId: 7,
      loanAmount: 100_000_000,
      termMonths: 24,
      interestRate: 24,
      repaymentType: "annuity",
    });
    expect(r.success).toBe(true);
  });

  it("rejects negative loan amount", () => {
    const r = MiniAppCalculateBody.safeParse({
      clientId: 42,
      productId: 7,
      loanAmount: -1,
      termMonths: 24,
      interestRate: 24,
      repaymentType: "annuity",
    });
    expect(r.success).toBe(false);
  });
});

describe("MiniAppRecommendBody", () => {
  it("requires clientId", () => {
    expect(MiniAppRecommendBody.safeParse({ answers: [] }).success).toBe(false);
  });

  it("accepts clientId alone (answers defaults to [])", () => {
    expect(MiniAppRecommendBody.safeParse({ clientId: 1 }).success).toBe(true);
  });

  it("accepts a populated answers array", () => {
    const r = MiniAppRecommendBody.safeParse({
      clientId: 1,
      answers: [{ questionKey: "business_type", answer: "trade" }],
    });
    expect(r.success).toBe(true);
  });
});

describe("MiniAppBasketBody", () => {
  it("rejects empty items array", () => {
    expect(MiniAppBasketBody.safeParse({ clientId: 1, items: [] }).success).toBe(false);
  });

  it("rejects items missing required fields", () => {
    const r = MiniAppBasketBody.safeParse({ clientId: 1, items: [{ productId: 7 }] });
    expect(r.success).toBe(false);
  });

  it("accepts a complete basket item", () => {
    const r = MiniAppBasketBody.safeParse({
      clientId: 1,
      items: [{ productType: "credit", productId: 7, productName: "Working capital line" }],
    });
    expect(r.success).toBe(true);
  });
});

describe("MiniAppGeneratePdfBody", () => {
  it("accepts the optional flags", () => {
    expect(MiniAppGeneratePdfBody.safeParse({}).success).toBe(true);
    expect(
      MiniAppGeneratePdfBody.safeParse({ sendViaTelegram: true, language: "ru" }).success,
    ).toBe(true);
  });

  it("rejects an unsupported language", () => {
    const r = MiniAppGeneratePdfBody.safeParse({ language: "fr" });
    expect(r.success).toBe(false);
  });
});
