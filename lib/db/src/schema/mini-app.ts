import { pgTable, serial, text, integer, timestamp, boolean, numeric, jsonb, index } from "drizzle-orm/pg-core";
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
}, (table) => [
  index("client_notes_client_id_idx").on(table.clientId),
]);

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
}, (table) => [
  index("client_actions_client_id_idx").on(table.clientId),
  index("client_actions_user_completed_idx").on(table.userId, table.isCompleted),
  index("client_actions_client_completed_idx").on(table.clientId, table.isCompleted),
  index("client_actions_action_date_idx").on(table.actionDate),
]);

// Phase B3a: questionnaire tables archived in DB (renamed to
// archived_questionnaire_sessions / archived_questionnaire_answers via
// migration 0012). The fixed lead-form on /new-client now writes its
// answers directly onto clientsTable (preferredCurrency, purpose,
// desiredAmountUzs, desiredTermMonths, etc.), so no active code path
// references the legacy tables. The data is preserved for audit.

export const basketsTable = pgTable("baskets", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("baskets_client_status_idx").on(table.clientId, table.status),
]);

export const basketItemsTable = pgTable("basket_items", {
  id: serial("id").primaryKey(),
  basketId: integer("basket_id").notNull().references(() => basketsTable.id),
  productId: integer("product_id").references(() => creditProductsTable.id),
  productType: text("product_type").notNull().default("credit"),
  productName: text("product_name").notNull(),
  calculationId: integer("calculation_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("basket_items_basket_id_idx").on(table.basketId),
]);

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
}, (table) => [
  index("calculations_client_id_idx").on(table.clientId),
]);

// `doc_type` is a free-form text column (no DB enum) so legacy data flows through.
// Canonical values used by app code:
//   photo_storefront, photo_owner,
//   cadastre, vehicle_passport, business_license, financial_statement,
//   voice_note, consent_signature, other
export const clientDocumentsTable = pgTable("client_documents", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  docType: text("doc_type").notNull().default("other"),
  fileName: text("file_name").notNull(),
  storagePath: text("storage_path").notNull(),
  ocrText: text("ocr_text"),
  extractedData: jsonb("extracted_data"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("client_documents_client_id_idx").on(table.clientId),
]);
