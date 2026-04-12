import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase } from "./seed";

const rawPort = process.env["PORT"] ?? "8001";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function normalizePublicUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function getMiniAppUrl() {
  const explicitMiniAppUrl = process.env["MINI_APP_URL"];
  if (explicitMiniAppUrl) {
    return `${normalizePublicUrl(explicitMiniAppUrl)}/`;
  }

  const publicBaseUrl =
    process.env["APP_URL"] ??
    process.env["PUBLIC_APP_URL"] ??
    process.env["RAILWAY_PUBLIC_DOMAIN"] ??
    process.env["REPLIT_DEV_DOMAIN"] ??
    process.env["REPLIT_DOMAINS"]?.split(",")[0];

  if (!publicBaseUrl) {
    return "https://example.com/mini-app/";
  }

  return `${normalizePublicUrl(publicBaseUrl)}/mini-app/`;
}

let stopBotHandler: (() => void) | null = null;

async function startTelegramBot() {
  const { startBot, stopBot } = await import("./bot");
  stopBotHandler = stopBot;
  await startBot(getMiniAppUrl());
}

function shutdown() {
  stopBotHandler?.();
  process.exit(0);
}

seedDatabase().catch((err) => {
  logger.error({ err }, "Failed to seed database");
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, miniAppUrl: getMiniAppUrl() }, "Server listening");

  startTelegramBot().catch((err) => {
    logger.error({ err }, "Failed to start Telegram bot");
  });
});

process.on("SIGTERM", () => {
  shutdown();
});
process.on("SIGINT", () => {
  shutdown();
});
