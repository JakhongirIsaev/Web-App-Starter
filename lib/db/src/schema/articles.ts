import { pgTable, serial, text, boolean, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const articlesTable = pgTable("articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("general"),
  isPublished: boolean("is_published").notNull().default(false),
  targetAllBranches: boolean("target_all_branches").notNull().default(true),
  authorId: integer("author_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("articles_is_published_idx").on(table.isPublished),
  index("articles_created_at_idx").on(table.createdAt),
]);

export const articleVisibilityTable = pgTable("article_visibility", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => articlesTable.id),
  branchId: integer("branch_id").notNull(),
}, (table) => [
  index("article_visibility_article_id_idx").on(table.articleId),
  index("article_visibility_branch_id_idx").on(table.branchId),
]);

export const insertArticleSchema = createInsertSchema(articlesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = typeof articlesTable.$inferSelect;
