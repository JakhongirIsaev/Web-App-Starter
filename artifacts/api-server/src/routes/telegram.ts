import { Router } from "express";
import { webhookCallback } from "grammy";
import { getBot } from "../bot";

const router = Router();

router.post("/telegram/webhook", async (req, res, next) => {
  const bot = getBot();
  if (!bot) {
    res.status(503).json({ error: "Bot not initialized" });
    return;
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  
  // webhookCallback(bot, 'express', ...) returns a middleware function.
  // By passing the secretToken option, Grammy automatically asserts that 
  // the incoming X-Telegram-Bot-Api-Secret-Token header matches the secret.
  const cb = webhookCallback(bot, "express", {
    secretToken: secret,
  });

  return cb(req, res);
});

export default router;
