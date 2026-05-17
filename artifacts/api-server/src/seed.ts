import { db } from "@workspace/db";
import {
  collateralTypesTable,
  systemSettingKeys,
  systemSettingsTable,
} from "@workspace/db";

/**
 * Reference data for the collateral feature: 5 type rows + 3 default system
 * settings. Idempotent — uses ON CONFLICT DO NOTHING so re-runs are safe.
 *
 * Called unconditionally on every boot from index.ts; safe in production.
 *
 * NOTE (PR-S1): Demo users, branches, clients, articles, and activity log
 * seeding now lives in ./seed-demo-users.ts and is hard-disabled in production.
 */
export async function seedCollateralReferenceData() {
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
