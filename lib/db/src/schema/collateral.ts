import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { creditProductsTable } from "./credit-products";
import { usersTable } from "./users";

export const collateralTypeCodes = [
  "real_estate",
  "transport",
  "jewelry",
  "land_plot",
  "equipment",
] as const;
export type CollateralTypeCode = (typeof collateralTypeCodes)[number];

export const collateralResultStatusEnum = ["enough", "not_enough"] as const;
export type CollateralResultStatus = (typeof collateralResultStatusEnum)[number];

export const collateralTypesTable = pgTable("collateral_types", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  nameRu: text("name_ru").notNull(),
  nameUz: text("name_uz"),
  nameEn: text("name_en"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const collateralItemsTable = pgTable(
  "collateral_items",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    collateralTypeId: integer("collateral_type_id")
      .notNull()
      .references(() => collateralTypesTable.id),
    title: text("title").notNull(),
    description: text("description"),
    marketValue: numeric("market_value", { precision: 18, scale: 2 }).notNull(),
    acceptedValue: numeric("accepted_value", { precision: 18, scale: 2 }).notNull(),
    // null = no discount; otherwise the multiplier applied (e.g. 0.4000 for >7y transport)
    discountApplied: numeric("discount_applied", { precision: 5, scale: 4 }),
    discountReason: text("discount_reason"),
    currency: text("currency").notNull().default("UZS"),
    isThirdParty: boolean("is_third_party").notNull().default(false),
    thirdPartyOwnerName: text("third_party_owner_name"),
    metadata: jsonb("metadata").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by").references(() => usersTable.id),
    updatedBy: integer("updated_by").references(() => usersTable.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("collateral_items_client_id_idx").on(table.clientId),
    index("collateral_items_collateral_type_id_idx").on(table.collateralTypeId),
    index("collateral_items_client_active_idx").on(table.clientId, table.isActive),
  ],
);

export const collateralEstimatesTable = pgTable(
  "collateral_estimates",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    creditProductId: integer("credit_product_id")
      .notNull()
      .references(() => creditProductsTable.id),
    requestedLoanAmount: numeric("requested_loan_amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("UZS"),
    totalMarketValue: numeric("total_market_value", { precision: 18, scale: 2 }).notNull(),
    totalAcceptedValue: numeric("total_accepted_value", { precision: 18, scale: 2 }).notNull(),
    coverageRatioApplied: numeric("coverage_ratio_applied", { precision: 5, scale: 4 }).notNull(),
    requiredCollateralValue: numeric("required_collateral_value", { precision: 18, scale: 2 }).notNull(),
    coveragePercent: numeric("coverage_percent", { precision: 8, scale: 2 }).notNull(),
    maxLoanAmount: numeric("max_loan_amount", { precision: 18, scale: 2 }).notNull(),
    // credit_products.rateUZS is free text in this repo (e.g. "24%", "24-26%").
    // We snapshot both: the parsed numeric (annualRateApplied) when parseRateString
    // succeeds, and the raw text (annualRateAppliedRaw) always — so the UI can
    // fall back when parsing fails or the rate is a range.
    annualRateApplied: numeric("annual_rate_applied", { precision: 6, scale: 3 }),
    annualRateAppliedRaw: text("annual_rate_applied_raw"),
    resultStatus: text("result_status").notNull().$type<CollateralResultStatus>(),
    disclaimer: text("disclaimer"),
    notes: text("notes"),
    hasEquipmentOnly: boolean("has_equipment_only").notNull().default(false),
    createdBy: integer("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("collateral_estimates_client_id_idx").on(table.clientId),
    index("collateral_estimates_created_at_idx").on(table.createdAt),
  ],
);

export const collateralEstimateItemsTable = pgTable(
  "collateral_estimate_items",
  {
    id: serial("id").primaryKey(),
    estimateId: integer("estimate_id")
      .notNull()
      .references(() => collateralEstimatesTable.id, { onDelete: "cascade" }),
    collateralItemId: integer("collateral_item_id")
      .notNull()
      .references(() => collateralItemsTable.id),
    marketValueSnapshot: numeric("market_value_snapshot", { precision: 18, scale: 2 }).notNull(),
    discountAppliedSnapshot: numeric("discount_applied_snapshot", { precision: 5, scale: 4 }),
    acceptedValueSnapshot: numeric("accepted_value_snapshot", { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("collateral_estimate_items_unique").on(table.estimateId, table.collateralItemId),
  ],
);

export type CollateralType = typeof collateralTypesTable.$inferSelect;
export type CollateralItem = typeof collateralItemsTable.$inferSelect;
export type CollateralEstimate = typeof collateralEstimatesTable.$inferSelect;
export type CollateralEstimateItem = typeof collateralEstimateItemsTable.$inferSelect;
