import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase } from "./seed";
import { startBot, stopBot } from "./bot";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

seedDatabase().catch((err) => {
  logger.error({ err }, "Failed to seed database");
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const domain = process.env["REPLIT_DEV_DOMAIN"] || process.env["REPLIT_DOMAINS"]?.split(",")[0];
  const miniAppUrl =
    process.env["MINI_APP_URL"]?.trim() ||
    (domain ? `https://${domain}/mini-app/` : "https://example.com/mini-app/");
  startBot(miniAppUrl).catch((err) => {
    logger.error({ err }, "Failed to start Telegram bot");
  });
});

process.on("SIGTERM", () => {
  stopBot();
  process.exit(0);
});
process.on("SIGINT", () => {
  stopBot();
  process.exit(0);
});
