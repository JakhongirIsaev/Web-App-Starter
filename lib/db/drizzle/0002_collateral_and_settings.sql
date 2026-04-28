CREATE TABLE "collateral_estimate_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"estimate_id" integer NOT NULL,
	"collateral_item_id" integer NOT NULL,
	"market_value_snapshot" numeric(18, 2) NOT NULL,
	"discount_applied_snapshot" numeric(5, 4),
	"accepted_value_snapshot" numeric(18, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collateral_estimates" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"credit_product_id" integer NOT NULL,
	"requested_loan_amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'UZS' NOT NULL,
	"total_market_value" numeric(18, 2) NOT NULL,
	"total_accepted_value" numeric(18, 2) NOT NULL,
	"coverage_ratio_applied" numeric(5, 4) NOT NULL,
	"required_collateral_value" numeric(18, 2) NOT NULL,
	"coverage_percent" numeric(8, 2) NOT NULL,
	"max_loan_amount" numeric(18, 2) NOT NULL,
	"annual_rate_applied" numeric(6, 3),
	"annual_rate_applied_raw" text,
	"result_status" text NOT NULL,
	"disclaimer" text,
	"notes" text,
	"has_equipment_only" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collateral_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"collateral_type_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"market_value" numeric(18, 2) NOT NULL,
	"accepted_value" numeric(18, 2) NOT NULL,
	"discount_applied" numeric(5, 4),
	"discount_reason" text,
	"currency" text DEFAULT 'UZS' NOT NULL,
	"is_third_party" boolean DEFAULT false NOT NULL,
	"third_party_owner_name" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collateral_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ru" text NOT NULL,
	"name_uz" text,
	"name_en" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "collateral_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "collateral_estimate_items" ADD CONSTRAINT "collateral_estimate_items_estimate_id_collateral_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."collateral_estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collateral_estimate_items" ADD CONSTRAINT "collateral_estimate_items_collateral_item_id_collateral_items_id_fk" FOREIGN KEY ("collateral_item_id") REFERENCES "public"."collateral_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collateral_estimates" ADD CONSTRAINT "collateral_estimates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collateral_estimates" ADD CONSTRAINT "collateral_estimates_credit_product_id_credit_products_id_fk" FOREIGN KEY ("credit_product_id") REFERENCES "public"."credit_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collateral_estimates" ADD CONSTRAINT "collateral_estimates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collateral_items" ADD CONSTRAINT "collateral_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collateral_items" ADD CONSTRAINT "collateral_items_collateral_type_id_collateral_types_id_fk" FOREIGN KEY ("collateral_type_id") REFERENCES "public"."collateral_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collateral_items" ADD CONSTRAINT "collateral_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collateral_items" ADD CONSTRAINT "collateral_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collateral_estimate_items_unique" ON "collateral_estimate_items" USING btree ("estimate_id","collateral_item_id");--> statement-breakpoint
CREATE INDEX "collateral_estimates_client_id_idx" ON "collateral_estimates" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "collateral_estimates_created_at_idx" ON "collateral_estimates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "collateral_items_client_id_idx" ON "collateral_items" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "collateral_items_collateral_type_id_idx" ON "collateral_items" USING btree ("collateral_type_id");--> statement-breakpoint
CREATE INDEX "collateral_items_client_active_idx" ON "collateral_items" USING btree ("client_id","is_active");