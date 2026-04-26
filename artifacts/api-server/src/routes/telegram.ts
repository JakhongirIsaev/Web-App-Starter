import { Router } from "express";
import { webhookCallback } from "grammy";
import { getBot } from "../bot";

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

router.post("/telegram/webhook", async (req, res) => {
  const bot = getBot();
  if (!bot) {
    res.status(503).json({ error: "Telegram xizmati ishga tushmagan" });
    return;
  }

  const decision = decideWebhookSecret(
    process.env.TELEGRAM_WEBHOOK_SECRET,
    process.env.NODE_ENV === "production",
  );

  if (decision.action === "reject") {
    res.status(403).json({ error: "Telegram ulanishi sozlanmagan" });
    return;
  }

  const cb = webhookCallback(bot, "express", {
    secretToken: decision.action === "verify" ? decision.secret : undefined,
  });

  return cb(req, res);
});

export default router;
