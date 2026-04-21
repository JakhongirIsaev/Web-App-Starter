import crypto from "crypto";

const DEFAULT_MAX_AGE_SECONDS = 300;
const FUTURE_SKEW_SECONDS = 60;

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

function maxAgeFromEnv(): number {
  const raw = process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS;
  if (!raw) return DEFAULT_MAX_AGE_SECONDS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_AGE_SECONDS;
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  opts: { maxAgeSeconds?: number; nowMs?: number } = {},
): { valid: boolean; user?: TelegramWebAppUser } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { valid: false };

    const authDateRaw = params.get("auth_date");
    if (!authDateRaw) return { valid: false };
    const authDate = Number(authDateRaw);
    if (!Number.isFinite(authDate) || authDate <= 0) return { valid: false };

    const maxAgeSeconds = opts.maxAgeSeconds ?? maxAgeFromEnv();
    const nowSeconds = Math.floor((opts.nowMs ?? Date.now()) / 1000);
    if (nowSeconds - authDate > maxAgeSeconds) return { valid: false };
    if (authDate - nowSeconds > FUTURE_SKEW_SECONDS) return { valid: false };

    params.delete("hash");

    const entries = Array.from(params.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const dataCheckString = entries
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const computedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (computedHash !== hash) {
      return { valid: false };
    }

    const userRaw = params.get("user");
    if (!userRaw) {
      return { valid: false };
    }

    return {
      valid: true,
      user: JSON.parse(userRaw) as TelegramWebAppUser,
    };
  } catch {
    return { valid: false };
  }
}
