import { pgTable, serial, text, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branchesTable } from "./branches";
import { usersTable } from "./users";

export const clientStatusEnum = [
  "draft", "questionnaire", "recommendation", "basket", "pdf_generated", "completed", "rejected"
] as const;
export type ClientStatus = typeof clientStatusEnum[number];

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  fullName: text("full_name"),
  phone: text("phone"),
  tin: text("tin"),
  status: text("status").notNull().$type<ClientStatus>().default("draft"),
  gender: text("gender"),
  genderSource: text("gender_source"),
  genderConfidence: numeric("gender_confidence", { precision: 4, scale: 3 }),
  badges: jsonb("badges").$type<string[]>(),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  assignedToId: integer("assigned_to_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
