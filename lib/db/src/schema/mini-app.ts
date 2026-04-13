import { pgTable, serial, text, integer, timestamp, boolean, numeric, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { branchesTable } from "./branches";
import { clientsTable } from "./clients";
import { creditProductsTable } from "./credit-products";

export const clientNotesTable = pgTable("client_notes", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: text("type").notNull().default("note"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const clientNextActionsTable = pgTable("client_next_actions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  actionType: text("action_type").notNull(),
  actionDate: timestamp("action_date").notNull(),
  priority: text("priority").notNull().default("medium"),
  description: text("description"),
  isCompleted: boolean("is_completed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const questionnaireSessionsTable = pgTable("questionnaire_sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  status: text("status").notNull().default("in_progress"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const questionnaireAnswersTable = pgTable("questionnaire_answers", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => questionnaireSessionsTable.id),
  questionKey: text("question_key").notNull(),
  answer: text("answer").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const basketsTable = pgTable("baskets", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const basketItemsTable = pgTable("basket_items", {
  id: serial("id").primaryKey(),
  basketId: integer("basket_id").notNull().references(() => basketsTable.id),
  productId: integer("product_id").references(() => creditProductsTable.id),
  productType: text("product_type").notNull().default("credit"),
  productName: text("product_name").notNull(),
  calculationId: integer("calculation_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const calculationsTable = pgTable("calculations", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  basketItemId: integer("basket_item_id"),
  productName: text("product_name").notNull(),
  loanAmount: numeric("loan_amount", { precision: 18, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 6, scale: 3 }).notNull(),
  termMonths: integer("term_months").notNull(),
  repaymentType: text("repayment_type").notNull().default("annuity"),
  initialPayment: numeric("initial_payment", { precision: 18, scale: 2 }),
  gracePeriodMonths: integer("grace_period_months").default(0),
  monthlyPayment: numeric("monthly_payment", { precision: 18, scale: 2 }),
  totalPayment: numeric("total_payment", { precision: 18, scale: 2 }),
  totalInterest: numeric("total_interest", { precision: 18, scale: 2 }),
  currency: text("currency").notNull().default("UZS"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const clientDocumentsTable = pgTable("client_documents", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  docType: text("doc_type").notNull().default("other"),
  fileName: text("file_name").notNull(),
  storagePath: text("storage_path").notNull(),
  ocrText: text("ocr_text"),
  extractedData: jsonb("extracted_data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
