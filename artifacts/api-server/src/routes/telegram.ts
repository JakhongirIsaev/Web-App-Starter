import { Router } from "express";
import { webhookCallback } from "grammy";
import { getBot } from "../bot";

const router = Router();

router.post("/telegram/webhook", async (req, res) => {
  const bot = getBot();
  if (!bot) {
    res.status(503).json({ error: "Bot not initialized" });
    return;
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  // Fail closed: if the secret is not configured we cannot verify the request
  // origin. In production this must always be set; reject the request rather
  // than silently accepting unsigned webhooks.
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      res.status(403).json({ error: "Webhook not configured" });
      return;
    }
    // In development, allow unsigned webhooks for local tunnels (ngrok etc).
  }

  // Grammy's webhookCallback verifies the X-Telegram-Bot-Api-Secret-Token
  // header when secretToken is provided; undefined skips verification (dev only).
  const cb = webhookCallback(bot, "express", {
    secretToken: secret,
  });

  return cb(req, res);
});

export default router;
