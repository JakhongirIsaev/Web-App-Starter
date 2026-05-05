import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const espoReconciliationRunsTable = pgTable("espo_reconciliation_runs", {
  id: serial("id").primaryKey(),
  ranAt: timestamp("ran_at").notNull().defaultNow(),
  windowFrom: timestamp("window_from").notNull(),
  windowTo: timestamp("window_to").notNull(),
  espoLeadCount: integer("espo_lead_count").notNull(),
  localLeadCount: integer("local_lead_count").notNull(),
  missingInEspo: jsonb("missing_in_espo").notNull(),    // local clients without an Espo match — array of { clientId, externalUuid }
  missingInLocal: jsonb("missing_in_local").notNull(),  // Espo leads without a local match — array of { espoLeadId, cLocalLeadUuid }
  notes: text("notes"),
}, (table) => [
  index("espo_reconciliation_runs_ran_at_idx").on(table.ranAt),
]);

export type EspoReconciliationRun = typeof espoReconciliationRunsTable.$inferSelect;
