import { Router } from "express";
import { forbidden, internalServerError } from "../lib/errors";
import { webhookCallback } from "grammy";
import { getBot } from "../bot";
import { logger } from "../lib/logger";

type WebhookSecretDecision =
  | { action: "verify"; secret: string }
  | { action: "allow-unsigned" }
  | { action: "reject" };

/**
 * Decide how the /telegram/webhook handler should treat an incoming request
 * based on whether a secret is configured and whether we are in production.
 *
 * - prod + secret   → verify against X-Telegram-Bot-Api-Secret-Token
 * - prod + no secret → reject (fail closed)
 * - dev  + secret   → verify
 * - dev  + no secret → allow (local tunnels like ngrok)
 */
export function decideWebhookSecret(
  secret: string | undefined,
  isProduction: boolean,
): WebhookSecretDecision {
  if (secret && secret.length > 0) return { action: "verify", secret };
  if (isProduction) return { action: "reject" };
  return { action: "allow-unsigned" };
}

const router = Router();

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

router.post("/telegram/webhook", async (req, res) => {
  const bot = getBot();
  if (!bot) {
    // SKIP(PR-E1): bespoke status 503 (not in helper set)
    res.status(503).json({ error: "Telegram xizmati ishga tushmagan / Сервис Telegram не запущен" });
    return;
  }

  const decision = decideWebhookSecret(
    process.env.TELEGRAM_WEBHOOK_SECRET,
    process.env.NODE_ENV === "production",
  );

  if (decision.action === "reject") {
    forbidden(res, "Telegram ulanishi sozlanmagan / Настройка Telegram не завершена");
    return;
  }

  const cb = webhookCallback(bot, "express", {
    secretToken: decision.action === "verify" ? decision.secret : undefined,
  });

  try {
    return await cb(req, res);
  } catch (err) {
    logger.error({ err: sanitizeWebhookError(err) }, "Telegram webhook error");
    if (!res.headersSent) {
      internalServerError(res, "Telegram webhook processing failed");
    }
  }
});

export default router;
