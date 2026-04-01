import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";

export const creditLinesTable = pgTable("credit_lines", {
  id: serial("id").primaryKey(),
  number: integer("number"),
  name: text("name").notNull(),
  department: text("department"),
  agreementDate: text("agreement_date"),
  agreementAmount: numeric("agreement_amount", { precision: 20, scale: 2 }),
  receivedAmount: numeric("received_amount", { precision: 20, scale: 2 }),
  currency: text("currency"),
  interestRate: text("interest_rate"),
  disbursedAmount: numeric("disbursed_amount", { precision: 20, scale: 2 }),
  remainingBalance: numeric("remaining_balance", { precision: 20, scale: 2 }),
  projectCount: integer("project_count"),
  specialConditions: text("special_conditions"),
  notes: text("notes"),
  section: text("section"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CreditLine = typeof creditLinesTable.$inferSelect;
