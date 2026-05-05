import { pgTable, serial, text, boolean, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branchesTable } from "./branches";

export const rolesEnum = ["superadmin", "head_office_admin", "editor", "branch_head", "hunter"] as const;
export type UserRole = typeof rolesEnum[number];

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  role: text("role").notNull().$type<UserRole>(),
  branchId: integer("branch_id").references(() => branchesTable.id),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("users_branch_id_idx").on(table.branchId),
  index("users_branch_active_idx").on(table.branchId, table.isActive),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
