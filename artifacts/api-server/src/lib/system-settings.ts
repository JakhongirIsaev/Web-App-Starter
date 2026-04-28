import { db } from "@workspace/db";
import { systemSettingKeys, systemSettingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import type { CollateralSettings } from "./collateral-calc";

// Defaults match the v3 spec — kept here in code so a missing settings row
// doesn't break the calculator. Admin edits via PUT /admin/collateral-settings.
const COLLATERAL_DEFAULTS = {
  coverageRatio: 1.25,
  transportAgeThreshold: 7,
  transportAgeDiscount: 0.4,
} as const;

function readNumber(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export async function getCollateralSettings(): Promise<CollateralSettings> {
  const rows = await db
    .select({ key: systemSettingsTable.key, value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(
      inArray(systemSettingsTable.key, [
        systemSettingKeys.collateralCoverageRatio,
        systemSettingKeys.collateralTransportAgeThreshold,
        systemSettingKeys.collateralTransportAgeDiscount,
      ]),
    );

  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    coverageRatio: readNumber(
      byKey.get(systemSettingKeys.collateralCoverageRatio),
      COLLATERAL_DEFAULTS.coverageRatio,
    ),
    transportAgeThreshold: readNumber(
      byKey.get(systemSettingKeys.collateralTransportAgeThreshold),
      COLLATERAL_DEFAULTS.transportAgeThreshold,
    ),
    transportAgeDiscount: readNumber(
      byKey.get(systemSettingKeys.collateralTransportAgeDiscount),
      COLLATERAL_DEFAULTS.transportAgeDiscount,
    ),
  };
}

export async function setCollateralSettings(
  next: CollateralSettings,
  updatedBy: number | null,
): Promise<void> {
  const updates: Array<{ key: string; value: number }> = [
    { key: systemSettingKeys.collateralCoverageRatio, value: next.coverageRatio },
    { key: systemSettingKeys.collateralTransportAgeThreshold, value: next.transportAgeThreshold },
    { key: systemSettingKeys.collateralTransportAgeDiscount, value: next.transportAgeDiscount },
  ];

  for (const { key, value } of updates) {
    await db
      .insert(systemSettingsTable)
      .values({ key, value, updatedBy })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value, updatedBy, updatedAt: new Date() },
      });
  }
}

export const __testing = { COLLATERAL_DEFAULTS, readNumber };
