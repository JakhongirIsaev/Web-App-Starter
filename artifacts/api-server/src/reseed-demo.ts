import { logger } from "./lib/logger";
import { seedDatabase } from "./seed";

async function main() {
  await seedDatabase({ force: true });
  logger.info("Demo data reseeded successfully");
}

main().catch((err) => {
  logger.error({ err }, "Failed to reseed demo data");
  process.exit(1);
});
