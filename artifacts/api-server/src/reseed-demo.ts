import { logger } from "./lib/logger";
import { seedDemoUsers } from "./seed-demo-users";

/**
 * CLI: reseed demo users + dependent demo content.
 *
 * Hard-disabled in production by seedDemoUsers (see PR-S1). Run with
 * `pnpm tsx src/reseed-demo.ts` or via your task runner.
 */
async function main() {
  await seedDemoUsers({ force: true });
  logger.info("Demo data reseeded successfully");
}

main().catch((err) => {
  logger.error({ err }, "Failed to reseed demo data");
  process.exit(1);
});
