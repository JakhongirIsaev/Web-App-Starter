import { pgTable, serial, text, jsonb, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Versioned credit-policy parameters. Each row is a complete snapshot of every
// numeric policy value (rates, ratios, term caps, etc.). The active row is
// whichever has the latest effective_from <= now() AND (effective_to IS NULL
// OR effective_to > now()).
export const policyParamVersionsTable = pgTable("policy_param_versions", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(),               // e.g. "2026.05" — human label
  effectiveFrom: timestamp("effective_from").notNull(),
  effectiveTo: timestamp("effective_to"),           // null = open-ended
  value: jsonb("value").notNull(),                  // PolicyParams JSON shape
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("policy_param_versions_effective_idx").on(table.effectiveFrom),
]);

export type PolicyParamVersion = typeof policyParamVersionsTable.$inferSelect;
