CREATE TABLE "recommendation_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"tags" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"author_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recommendation_documents" ADD CONSTRAINT "recommendation_documents_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendation_documents_active_idx" ON "recommendation_documents" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "recommendation_documents_sort_idx" ON "recommendation_documents" USING btree ("sort_order");