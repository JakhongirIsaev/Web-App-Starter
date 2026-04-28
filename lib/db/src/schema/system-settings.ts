import { pgTable, serial, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Key-value system settings. Typed accessors live in
// artifacts/api-server/src/lib/system-settings.ts so callers don't deal with
// raw JSON or the (key,value) shape directly.
export const systemSettingsTable = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Known setting keys. Add new ones here so callers can't typo silently.
export const systemSettingKeys = {
  collateralCoverageRatio: "collateral.coverage_ratio",
  collateralTransportAgeThreshold: "collateral.transport_age_threshold",
  collateralTransportAgeDiscount: "collateral.transport_age_discount",
} as const;

export type SystemSettingKey = (typeof systemSettingKeys)[keyof typeof systemSettingKeys];

export type SystemSetting = typeof systemSettingsTable.$inferSelect;
