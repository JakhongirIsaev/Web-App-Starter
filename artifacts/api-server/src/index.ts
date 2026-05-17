import app from "./app";
import { logger } from "./lib/logger";
import { seedCollateralReferenceData } from "./seed";
import { seedDemoUsers } from "./seed-demo-users";
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

const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.SIGNED_URL_SECRET) {
  throw new Error(
    "SIGNED_URL_SECRET must be set in production (used to sign object URLs).",
  );
}

function resolveMiniAppUrl() {
  const miniAppUrlEnv = process.env["MINI_APP_URL"]?.trim();
  if (isProduction && !miniAppUrlEnv) {
    throw new Error("MINI_APP_URL must be set in production.");
  }

  return miniAppUrlEnv || "https://example.com/mini-app/";
}

/**
 * SECURITY (PR-S1): Demo seeding installs accounts with the well-known
 * password "password" and synthetic Telegram IDs. It must be disabled by
 * default in production. Operators who explicitly want it (eg. a sandbox
 * preview env) must set SEED_DEMO_USERS=true. The legacy
 * SEED_DATABASE_ON_BOOT flag is honoured as a deprecated alias for backwards
 * compatibility with existing dev/CI envs.
 */
function shouldSeedDemoUsers() {
  if (isProduction) {
    const explicit = process.env["SEED_DEMO_USERS"]?.trim().toLowerCase();
    return explicit === "true";
  }
  const explicit = process.env["SEED_DEMO_USERS"]?.trim().toLowerCase();
  if (explicit === "false") return false;
  if (explicit === "true") return true;
  const legacy = process.env["SEED_DATABASE_ON_BOOT"]?.trim().toLowerCase();
  if (legacy === "false") return false;
  return true;
}

const miniAppUrl = resolveMiniAppUrl();
const seedDemoOnBoot = shouldSeedDemoUsers();

// Reference data (5 collateral types + 3 default system settings) runs every
// boot. Idempotent via ON CONFLICT DO NOTHING.
seedCollateralReferenceData().catch((err) => {
  logger.error({ err }, "Failed to seed collateral reference data");
});

// Versioned credit-policy parameters (v1 = 2026.05). Idempotent -- only
// inserts when the table is empty.
seedPolicyParamsV1().catch((err) => {
  logger.error({ err }, "Failed to seed policy params v1");
});

// Credit products, SAP codes, and credit-line balances are reference data
// (not demo). Always seed them (idempotent per-table).
seedExcelData().catch((err) => {
  logger.error({ err }, "Failed to seed Excel reference data");
});

if (seedDemoOnBoot) {
  seedDemoUsers().catch((err) => {
    logger.error({ err }, "Failed to seed demo users");
  });
} else {
  logger.info("Skipping demo user seeding on boot");
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
