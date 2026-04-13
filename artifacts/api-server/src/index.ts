import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

// Route Node's global fetch through HTTP_PROXY/HTTPS_PROXY when set so that
// outbound requests (notably to Ollama on the user's tailnet) traverse the
// Tailscale userspace proxy started by start.sh. Safe no-op when unset.
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase } from "./seed";
import { validateRuntimeEnv } from "./lib/env";
import { ensureRuntimeSchema } from "./lib/runtime-schema";
import { pruneExpiredSessions } from "./lib/sessions";
import { aiHealthCheck, logAiConfig } from "./lib/ai-client";

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

async function main() {
  validateRuntimeEnv();
  logAiConfig();
  aiHealthCheck()
    .then((result) => {
      if (!result.ok) {
        logger.warn({ ...result }, "AI provider unreachable — endpoints will error until fixed");
      } else {
        logger.info({ ...result }, "AI provider reachable");
      }
    })
    .catch((err) => logger.warn({ err }, "AI health check failed"));
  await ensureRuntimeSchema();
  await pruneExpiredSessions();
  await seedDatabase();

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
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});

process.on("SIGTERM", () => {
  shutdown();
});
process.on("SIGINT", () => {
  shutdown();
});
