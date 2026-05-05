import { pgTable, serial, text, integer, timestamp, jsonb, uuid, index } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const espoSyncJobsTable = pgTable("espo_sync_jobs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  idempotencyKey: uuid("idempotency_key").notNull(),
  status: text("status").notNull().default("pending"), // pending | succeeded | failed
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  payloadSnapshot: jsonb("payload_snapshot"),
  espoLeadId: text("espo_lead_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("espo_jobs_status_idx").on(table.status),
  index("espo_jobs_client_id_idx").on(table.clientId),
  index("espo_jobs_idempotency_idx").on(table.idempotencyKey),
]);

export type EspoSyncJob = typeof espoSyncJobsTable.$inferSelect;
