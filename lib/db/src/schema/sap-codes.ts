import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const sapCodesTable = pgTable("sap_codes", {
  id: serial("id").primaryKey(),
  status: text("status").notNull(),
  productId: text("product_id"),
  name: text("name").notNull(),
  productType: text("product_type"),
  categoryId: text("category_id"),
  categoryName: text("category_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SapCode = typeof sapCodesTable.$inferSelect;
