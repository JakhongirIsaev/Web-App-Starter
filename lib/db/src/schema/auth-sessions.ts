import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const authSessionsTable = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    userIdx: index("auth_sessions_user_id_idx").on(table.userId),
    expiresIdx: index("auth_sessions_expires_at_idx").on(table.expiresAt),
  }),
);

export type AuthSession = typeof authSessionsTable.$inferSelect;
export type InsertAuthSession = typeof authSessionsTable.$inferInsert;
