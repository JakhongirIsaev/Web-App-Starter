CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"entity_id" integer,
	"entity_type" text,
	"user_id" integer,
	"user_name" text,
	"branch_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_visibility" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"branch_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"target_all_branches" boolean DEFAULT true NOT NULL,
	"author_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"full_name" text,
	"phone" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"branch_id" integer NOT NULL,
	"assigned_to_id" integer,
	"client_type" text,
	"client_segment" text,
	"gender" text,
	"rejection_reason" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clients_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "credit_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer,
	"name" text NOT NULL,
	"department" text,
	"agreement_date" text,
	"agreement_amount" numeric(20, 2),
	"received_amount" numeric(20, 2),
	"currency" text,
	"interest_rate" text,
	"disbursed_amount" numeric(20, 2),
	"remaining_balance" numeric(20, 2),
	"project_count" integer,
	"special_conditions" text,
	"notes" text,
	"section" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer,
	"name" text NOT NULL,
	"sap_code" text,
	"segment" text,
	"disbursement_form" text,
	"loan_amount" text,
	"term_working_capital" text,
	"term_fixed_assets" text,
	"term_untargeted" text,
	"rate_uzs" text,
	"rate_usd" text,
	"rate_eur" text,
	"grace_period" text,
	"purpose" text,
	"highlight" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"branch_id" integer,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"category_id" integer,
	"description" text,
	"min_amount" numeric(15, 2),
	"max_amount" numeric(15, 2),
	"min_term_months" integer,
	"max_term_months" integer,
	"interest_rate" numeric(5, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sap_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"product_id" text,
	"name" text NOT NULL,
	"product_type" text,
	"category_id" text,
	"category_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "basket_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"basket_id" integer NOT NULL,
	"product_id" integer,
	"product_type" text DEFAULT 'credit' NOT NULL,
	"product_name" text NOT NULL,
	"calculation_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baskets" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calculations" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"user_id" integer NOT NULL,
	"basket_item_id" integer,
	"product_name" text NOT NULL,
	"loan_amount" numeric(18, 2) NOT NULL,
	"interest_rate" numeric(6, 3) NOT NULL,
	"term_months" integer NOT NULL,
	"repayment_type" text DEFAULT 'annuity' NOT NULL,
	"initial_payment" numeric(18, 2),
	"grace_period_months" integer DEFAULT 0,
	"monthly_payment" numeric(18, 2),
	"total_payment" numeric(18, 2),
	"total_interest" numeric(18, 2),
	"currency" text DEFAULT 'UZS' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"doc_type" text DEFAULT 'other' NOT NULL,
	"file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"ocr_text" text,
	"extracted_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_next_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"action_type" text NOT NULL,
	"action_date" timestamp NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"description" text,
	"is_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"type" text DEFAULT 'note' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"question_key" text NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_visibility" ADD CONSTRAINT "article_visibility_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basket_items" ADD CONSTRAINT "basket_items_basket_id_baskets_id_fk" FOREIGN KEY ("basket_id") REFERENCES "public"."baskets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basket_items" ADD CONSTRAINT "basket_items_product_id_credit_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."credit_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baskets" ADD CONSTRAINT "baskets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baskets" ADD CONSTRAINT "baskets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_next_actions" ADD CONSTRAINT "client_next_actions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_next_actions" ADD CONSTRAINT "client_next_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_session_id_questionnaire_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."questionnaire_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_sessions" ADD CONSTRAINT "questionnaire_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_sessions" ADD CONSTRAINT "questionnaire_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_created_at_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activity_log_branch_name_idx" ON "activity_log" USING btree ("branch_name");--> statement-breakpoint
CREATE INDEX "article_visibility_article_id_idx" ON "article_visibility" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "article_visibility_branch_id_idx" ON "article_visibility" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "articles_is_published_idx" ON "articles" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "clients_branch_id_idx" ON "clients" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "clients_assigned_to_id_idx" ON "clients" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clients_created_at_idx" ON "clients" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "clients_updated_at_idx" ON "clients" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "clients_branch_status_idx" ON "clients" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "clients_assigned_status_idx" ON "clients" USING btree ("assigned_to_id","status");--> statement-breakpoint
CREATE INDEX "clients_assigned_created_idx" ON "clients" USING btree ("assigned_to_id","created_at");--> statement-breakpoint
CREATE INDEX "users_branch_id_idx" ON "users" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "users_branch_active_idx" ON "users" USING btree ("branch_id","is_active");--> statement-breakpoint
CREATE INDEX "basket_items_basket_id_idx" ON "basket_items" USING btree ("basket_id");--> statement-breakpoint
CREATE INDEX "baskets_client_status_idx" ON "baskets" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "calculations_client_id_idx" ON "calculations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_documents_client_id_idx" ON "client_documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_actions_client_id_idx" ON "client_next_actions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_actions_user_completed_idx" ON "client_next_actions" USING btree ("user_id","is_completed");--> statement-breakpoint
CREATE INDEX "client_actions_client_completed_idx" ON "client_next_actions" USING btree ("client_id","is_completed");--> statement-breakpoint
CREATE INDEX "client_actions_action_date_idx" ON "client_next_actions" USING btree ("action_date");--> statement-breakpoint
CREATE INDEX "client_notes_client_id_idx" ON "client_notes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "questionnaire_answers_session_id_idx" ON "questionnaire_answers" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "questionnaire_sessions_client_id_idx" ON "questionnaire_sessions" USING btree ("client_id");