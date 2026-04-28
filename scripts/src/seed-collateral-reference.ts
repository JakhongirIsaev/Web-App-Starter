// Operational recovery tool for new/broken environments.
//
// Usage:
//   DATABASE_URL=... pnpm --filter @workspace/scripts run seed:collateral-reference
//
// The API server already runs this seed idempotently on boot. This script is
// for manual recovery when an environment needs to be baselined without
// redeploying the API service.
import {
  collateralTypesTable,
  db,
  pool,
  systemSettingKeys,
  systemSettingsTable,
} from "@workspace/db";
import { asc } from "drizzle-orm";

async function seedCollateralReferenceData() {
  await db
    .insert(collateralTypesTable)
    .values([
      { code: "real_estate", nameRu: "Недвижимость", nameUz: "Ko'chmas mulk", sortOrder: 10 },
      { code: "transport", nameRu: "Транспорт", nameUz: "Transport", sortOrder: 20 },
      { code: "jewelry", nameRu: "Драгоценности", nameUz: "Zargarlik buyumlari", sortOrder: 30 },
      { code: "land_plot", nameRu: "Земельный участок", nameUz: "Yer uchastkasi", sortOrder: 40 },
      { code: "equipment", nameRu: "Оборудование", nameUz: "Uskunalar", sortOrder: 50 },
    ])
    .onConflictDoNothing({ target: collateralTypesTable.code });

  await db
    .insert(systemSettingsTable)
    .values([
      { key: systemSettingKeys.collateralCoverageRatio, value: 1.25 },
      { key: systemSettingKeys.collateralTransportAgeThreshold, value: 7 },
      { key: systemSettingKeys.collateralTransportAgeDiscount, value: 0.4 },
    ])
    .onConflictDoNothing({ target: systemSettingsTable.key });
}

async function printCurrentState() {
  const types = await db
    .select({
      id: collateralTypesTable.id,
      code: collateralTypesTable.code,
      nameRu: collateralTypesTable.nameRu,
      sortOrder: collateralTypesTable.sortOrder,
    })
    .from(collateralTypesTable)
    .orderBy(asc(collateralTypesTable.sortOrder));

  console.log(`\ncollateral_types: ${types.length} rows`);
  for (const row of types) {
    console.log(`  ${row.id}  ${row.code.padEnd(12)}  ${row.nameRu}  (sort=${row.sortOrder})`);
  }

  const settings = await db
    .select({
      key: systemSettingsTable.key,
      value: systemSettingsTable.value,
    })
    .from(systemSettingsTable)
    .orderBy(asc(systemSettingsTable.key));

  console.log(`\nsystem_settings: ${settings.length} rows`);
  for (const row of settings) {
    console.log(`  ${row.key.padEnd(40)}  ${JSON.stringify(row.value)}`);
  }
}

async function main() {
  console.log("connecting...");
  await pool.query("SELECT 1");
  console.log("connected");

  console.log("\nensuring collateral reference data...");
  await seedCollateralReferenceData();

  console.log("\ncurrent state:");
  await printCurrentState();
}

main()
  .catch((err: unknown) => {
    console.error("[seed-collateral-reference] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
