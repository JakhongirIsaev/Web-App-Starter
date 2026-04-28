import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

export const activityLogTable = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  entityId: integer("entity_id"),
  entityType: text("entity_type"),
  userId: integer("user_id"),
  userName: text("user_name"),
  branchName: text("branch_name"),
  // Structured payload for events that carry old/new values, IDs, or other
  // non-prose context (e.g. collateral_settings_updated). Free-form JSON so
  // future event types can extend without schema changes.
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("activity_log_created_at_idx").on(table.createdAt),
  index("activity_log_branch_name_idx").on(table.branchName),
]);

export type ActivityLog = typeof activityLogTable.$inferSelect;
