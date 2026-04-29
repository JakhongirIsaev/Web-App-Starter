import { pgTable, serial, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Knowledge-base documents written by domain experts (non-technical staff
// authoring via admin UI). Markdown body. Surfaced to hunters via a
// read-only feed and used as RAG context for AI recommendations later.
export const recommendationDocumentsTable = pgTable(
  "recommendation_documents",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // free-form comma-separated tags for filtering (e.g. "transport,>7y,jewelry")
    tags: text("tags").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    authorId: integer("author_id").references(() => usersTable.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("recommendation_documents_active_idx").on(table.isActive),
    index("recommendation_documents_sort_idx").on(table.sortOrder),
  ],
);

export type RecommendationDocument = typeof recommendationDocumentsTable.$inferSelect;
