import crypto from "crypto";
import { describe, it, expect } from "vitest";
import { validateTelegramInitData } from "../lib/telegram";

const BOT_TOKEN = "test-bot-token-12345";

function signInitData(
  fields: Record<string, string>,
  botToken = BOT_TOKEN,
): string {
  const params = new URLSearchParams(fields);
  const entries = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.append("hash", hash);
  return params.toString();
}

describe("validateTelegramInitData", () => {
  const now = 1_800_000_000_000;
  const nowSeconds = Math.floor(now / 1000);
  const user = JSON.stringify({ id: 42, first_name: "T" });

  it("accepts a fresh, correctly signed payload", () => {
    const initData = signInitData({
      auth_date: String(nowSeconds - 10),
      user,
    });
    const result = validateTelegramInitData(initData, BOT_TOKEN, { nowMs: now });
    expect(result.valid).toBe(true);
    expect(result.user?.id).toBe(42);
  });

  it("rejects a payload older than maxAgeSeconds (replay protection)", () => {
    const initData = signInitData({
      auth_date: String(nowSeconds - 3600),
      user,
    });
    const result = validateTelegramInitData(initData, BOT_TOKEN, {
      nowMs: now,
      maxAgeSeconds: 300,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a payload missing auth_date", () => {
    const initData = signInitData({ user });
    const result = validateTelegramInitData(initData, BOT_TOKEN, { nowMs: now });
    expect(result.valid).toBe(false);
  });

  it("rejects a payload whose auth_date is far in the future (clock skew > 60s)", () => {
    const initData = signInitData({
      auth_date: String(nowSeconds + 600),
      user,
    });
    const result = validateTelegramInitData(initData, BOT_TOKEN, { nowMs: now });
    expect(result.valid).toBe(false);
  });

  it("rejects a payload with an invalid HMAC", () => {
    const initData = signInitData(
      { auth_date: String(nowSeconds - 10), user },
      "different-bot-token",
    );
    const result = validateTelegramInitData(initData, BOT_TOKEN, { nowMs: now });
    expect(result.valid).toBe(false);
  });

  it("rejects non-numeric auth_date", () => {
    const initData = signInitData({ auth_date: "abc", user });
    const result = validateTelegramInitData(initData, BOT_TOKEN, { nowMs: now });
    expect(result.valid).toBe(false);
  });

  it("accepts small clock skew within 60s future tolerance", () => {
    const initData = signInitData({
      auth_date: String(nowSeconds + 30),
      user,
    });
    const result = validateTelegramInitData(initData, BOT_TOKEN, { nowMs: now });
    expect(result.valid).toBe(true);
  });
});
