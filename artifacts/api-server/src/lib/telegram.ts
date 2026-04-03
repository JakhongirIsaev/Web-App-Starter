import crypto from "crypto";

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
): { valid: boolean; user?: TelegramWebAppUser } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) {
      return { valid: false };
    }

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
