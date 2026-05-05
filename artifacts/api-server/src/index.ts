import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase, seedCollateralReferenceData } from "./seed";
import { seedExcelData } from "./seed-excel";
import { seedPolicyParamsV1 } from "./seed/policy-params-v1";
import { startBot, stopBot } from "./bot";
import { deleteExpiredSessions } from "./lib/session-store";

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

if (process.env.NODE_ENV === "production" && !process.env.SIGNED_URL_SECRET) {
  throw new Error(
    "SIGNED_URL_SECRET must be set in production (used to sign object URLs).",
  );
}

function resolveMiniAppUrl() {
  const miniAppUrlEnv = process.env["MINI_APP_URL"]?.trim();
  if (process.env.NODE_ENV === "production" && !miniAppUrlEnv) {
    throw new Error("MINI_APP_URL must be set in production.");
  }

  return miniAppUrlEnv || "https://example.com/mini-app/";
}

function shouldSeedOnBoot() {
  const raw = process.env["SEED_DATABASE_ON_BOOT"]?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV !== "production";
}

const miniAppUrl = resolveMiniAppUrl();
const seedDemoOnBoot = shouldSeedOnBoot();

// Reference data (5 collateral types + 3 default system settings) runs every
// boot. Idempotent via ON CONFLICT DO NOTHING. NOT gated by
// SEED_DATABASE_ON_BOOT — that flag is for demo/dummy data only.
seedCollateralReferenceData().catch((err) => {
  logger.error({ err }, "Failed to seed collateral reference data");
});

// Versioned credit-policy parameters (v1 = 2026.05). Idempotent — only inserts
// when the table is empty. Same boot rules as collateral reference data: runs
// every boot, NOT gated by SEED_DATABASE_ON_BOOT.
seedPolicyParamsV1().catch((err) => {
  logger.error({ err }, "Failed to seed policy params v1");
});

if (seedDemoOnBoot) {
  seedDatabase().catch((err) => {
    logger.error({ err }, "Failed to seed database");
  });
} else {
  // Credit products, SAP codes, and credit-line balances are reference data,
  // not demo users/clients. Keep them available even when dummy data seeding is
  // disabled for production.
  seedExcelData().catch((err) => {
    logger.error({ err }, "Failed to seed Excel reference data");
  });
  logger.info("Skipping database seed on production boot");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Periodically purge expired sessions (every 1 hour).
  const sessionCleanup = setInterval(async () => {
    try {
      await deleteExpiredSessions();
    } catch (err) {
      logger.error({ err }, "Failed to delete expired sessions");
    }
  }, 60 * 60 * 1000);
  sessionCleanup.unref();

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
