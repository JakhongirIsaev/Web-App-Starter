import { describe, it, expect } from "vitest";

describe("policy-params routes", () => {
  it("module exports a default router", async () => {
    const mod = await import("../routes/policy-params");
    expect(mod.default).toBeDefined();
  });
});
