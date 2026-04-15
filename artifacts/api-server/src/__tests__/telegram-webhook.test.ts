import { describe, it, expect } from "vitest";
import { decideWebhookSecret } from "../routes/telegram";

describe("decideWebhookSecret", () => {
  it("rejects in production when no secret is configured", () => {
    expect(decideWebhookSecret(undefined, true)).toEqual({ action: "reject" });
    expect(decideWebhookSecret("", true)).toEqual({ action: "reject" });
  });

  it("verifies in production when secret is configured", () => {
    expect(decideWebhookSecret("s3cret", true)).toEqual({
      action: "verify",
      secret: "s3cret",
    });
  });

  it("allows unsigned webhooks in development when no secret set", () => {
    expect(decideWebhookSecret(undefined, false)).toEqual({
      action: "allow-unsigned",
    });
    expect(decideWebhookSecret("", false)).toEqual({
      action: "allow-unsigned",
    });
  });

  it("still verifies in development when secret is configured", () => {
    expect(decideWebhookSecret("dev-secret", false)).toEqual({
      action: "verify",
      secret: "dev-secret",
    });
  });
});
