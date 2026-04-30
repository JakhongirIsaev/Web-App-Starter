import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// sanitizeWebhookError is NOT exported from src/routes/telegram.ts and
// there is no __testing export in that module. We replicate the pure
// function logic here for testing (same pattern as ai-fallback.test.ts).
// ---------------------------------------------------------------------------

function sanitizeWebhookError(error: unknown) {
  const botError = error as {
    name?: string;
    message?: string;
    error?: {
      name?: string;
      message?: string;
      description?: string;
      code?: number;
    };
  };

  return {
    name: botError?.name,
    message: botError?.message,
    causeName: botError?.error?.name,
    causeMessage: botError?.error?.message,
    description: botError?.error?.description,
    code: botError?.error?.code,
  };
}

// ---------------------------------------------------------------------------
// sanitizeWebhookError
// ---------------------------------------------------------------------------

describe("sanitizeWebhookError", () => {
  it("extracts top-level name and message from an Error", () => {
    const error = new Error("Something went wrong");
    error.name = "BotError";
    const result = sanitizeWebhookError(error);
    expect(result.name).toBe("BotError");
    expect(result.message).toBe("Something went wrong");
  });

  it("extracts nested cause fields from a grammy-style BotError", () => {
    const error = {
      name: "BotError",
      message: "Webhook processing failed",
      error: {
        name: "HttpError",
        message: "Request to Telegram API failed",
        description: "Bad Request: message is too long",
        code: 400,
      },
    };
    const result = sanitizeWebhookError(error);
    expect(result.name).toBe("BotError");
    expect(result.message).toBe("Webhook processing failed");
    expect(result.causeName).toBe("HttpError");
    expect(result.causeMessage).toBe("Request to Telegram API failed");
    expect(result.description).toBe("Bad Request: message is too long");
    expect(result.code).toBe(400);
  });

  it("returns undefined fields when error has no nested error", () => {
    const error = { name: "TypeError", message: "Cannot read properties" };
    const result = sanitizeWebhookError(error);
    expect(result.name).toBe("TypeError");
    expect(result.message).toBe("Cannot read properties");
    expect(result.causeName).toBeUndefined();
    expect(result.causeMessage).toBeUndefined();
    expect(result.description).toBeUndefined();
    expect(result.code).toBeUndefined();
  });

  it("handles null/undefined input gracefully", () => {
    const resultNull = sanitizeWebhookError(null);
    expect(resultNull.name).toBeUndefined();
    expect(resultNull.message).toBeUndefined();

    const resultUndefined = sanitizeWebhookError(undefined);
    expect(resultUndefined.name).toBeUndefined();
    expect(resultUndefined.message).toBeUndefined();
  });

  it("handles a plain string error", () => {
    const result = sanitizeWebhookError("string error");
    // String has no .name / .message properties in the object shape
    expect(result.name).toBeUndefined();
    expect(result.message).toBeUndefined();
  });

  it("handles an error with partial nested error", () => {
    const error = {
      name: "BotError",
      message: "Failed",
      error: {
        code: 503,
      },
    };
    const result = sanitizeWebhookError(error);
    expect(result.code).toBe(503);
    expect(result.causeName).toBeUndefined();
    expect(result.causeMessage).toBeUndefined();
    expect(result.description).toBeUndefined();
  });

  it("does not include any extra fields beyond the defined shape", () => {
    const error = {
      name: "BotError",
      message: "Oops",
      stack: "Error: Oops\n    at ...",
      error: {
        name: "Inner",
        message: "Detail",
        description: "Desc",
        code: 429,
        extra: "should not appear",
      },
    };
    const result = sanitizeWebhookError(error);
    const keys = Object.keys(result);
    expect(keys).toEqual(["name", "message", "causeName", "causeMessage", "description", "code"]);
    expect(result).not.toHaveProperty("stack");
    expect(result).not.toHaveProperty("extra");
  });
});
