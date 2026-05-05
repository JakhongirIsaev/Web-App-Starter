import { pgTable, serial, text, timestamp, integer, numeric, uuid, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branchesTable } from "./branches";
import { usersTable } from "./users";

export const clientStatusEnum = [
  "draft", "lead", "questionnaire",
  "recommendation", "basket", "pdf_generated",
  "under_review", "approved", "completed", "rejected",
] as const;
export type ClientStatus = typeof clientStatusEnum[number];

export const clientTypeEnum = ["individual", "corporate"] as const;
export type ClientType = typeof clientTypeEnum[number];

export const genderEnum = ["male", "female"] as const;
export type Gender = typeof genderEnum[number];

// Canonical lead_source values:
//   direct_visit, referral_existing_client, mass_media_tv, mass_media_radio,
//   mass_media_print, mahalla_booklet, walk_in, other
export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  fullName: text("full_name"),
  phone: text("phone"),
  status: text("status").notNull().$type<ClientStatus>().default("draft"),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  assignedToId: integer("assigned_to_id").references(() => usersTable.id),
  clientType: text("client_type").$type<ClientType>(),
  clientSegment: text("client_segment"),
  gender: text("gender").$type<Gender>(),
  rejectionReason: text("rejection_reason"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  externalUuid: uuid("external_uuid").notNull().defaultRandom().unique(),
  espoLeadId: text("espo_lead_id"),
  espoSyncedAt: timestamp("espo_synced_at"),
  espoLastError: text("espo_last_error"),
  leadSource: text("lead_source"),
  referrerClientId: integer("referrer_client_id"),  // self-FK; do NOT add .references() here to avoid circular reference issues
  selfCheckCitizenshipUz: boolean("self_check_citizenship_uz"),
  selfCheckSixMonthsOperation: boolean("self_check_six_months_operation"),
  selfCheckPredominantlyPrivate: boolean("self_check_predominantly_private"),
  selfCheckBranchServiceArea: boolean("self_check_branch_service_area"),
  purpose: text("purpose"),
  desiredAmountUzs: numeric("desired_amount_uzs", { precision: 18, scale: 2 }),
  desiredTermMonths: integer("desired_term_months"),
  preferredCurrency: text("preferred_currency"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("clients_branch_id_idx").on(table.branchId),
  index("clients_assigned_to_id_idx").on(table.assignedToId),
  index("clients_status_idx").on(table.status),
  index("clients_created_at_idx").on(table.createdAt),
  index("clients_updated_at_idx").on(table.updatedAt),
  index("clients_branch_status_idx").on(table.branchId, table.status),
  index("clients_assigned_status_idx").on(table.assignedToId, table.status),
  index("clients_assigned_created_idx").on(table.assignedToId, table.createdAt),
]);

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
