import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

export const creditProductsTable = pgTable("credit_products", {
  id: serial("id").primaryKey(),
  number: integer("number"),
  name: text("name").notNull(),
  sapCode: text("sap_code"),
  segment: text("segment"),
  disbursementForm: text("disbursement_form"),
  loanAmount: text("loan_amount"),
  termWorkingCapital: text("term_working_capital"),
  termFixedAssets: text("term_fixed_assets"),
  termUntargeted: text("term_untargeted"),
  rateUZS: text("rate_uzs"),
  rateUSD: text("rate_usd"),
  rateEUR: text("rate_eur"),
  gracePeriod: text("grace_period"),
  purpose: text("purpose"),
  highlight: text("highlight"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CreditProduct = typeof creditProductsTable.$inferSelect;
