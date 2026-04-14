import { pgTable, serial, text, timestamp, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branchesTable } from "./branches";
import { usersTable } from "./users";

export const clientStatusEnum = [
  "draft", "questionnaire", "recommendation", "basket", "pdf_generated", "completed", "rejected"
] as const;
export type ClientStatus = typeof clientStatusEnum[number];

export const clientTypeEnum = ["individual", "corporate"] as const;
export type ClientType = typeof clientTypeEnum[number];

export const genderEnum = ["male", "female"] as const;
export type Gender = typeof genderEnum[number];

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
