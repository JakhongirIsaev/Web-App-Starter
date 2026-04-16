import { describe, it, expect } from "vitest";
import { MiniAppQuestionnaireBody } from "@workspace/api-zod";

describe("MiniAppQuestionnaireBody.clearBasket", () => {
  const base = {
    clientId: 1,
    answers: [{ questionKey: "business_size", answer: "micro" }],
  };

  it("defaults clearBasket to false when omitted", () => {
    const r = MiniAppQuestionnaireBody.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.clearBasket).toBe(false);
  });

  it("accepts clearBasket: true", () => {
    const r = MiniAppQuestionnaireBody.safeParse({ ...base, clearBasket: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.clearBasket).toBe(true);
  });

  it("rejects non-boolean clearBasket", () => {
    const r = MiniAppQuestionnaireBody.safeParse({ ...base, clearBasket: "yes" });
    expect(r.success).toBe(false);
  });
});
