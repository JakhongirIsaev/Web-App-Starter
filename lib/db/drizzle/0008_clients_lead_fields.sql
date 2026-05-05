ALTER TABLE "clients" ADD COLUMN "lead_source" text;
ALTER TABLE "clients" ADD COLUMN "referrer_client_id" integer;
ALTER TABLE "clients" ADD COLUMN "self_check_citizenship_uz" boolean;
ALTER TABLE "clients" ADD COLUMN "self_check_six_months_operation" boolean;
ALTER TABLE "clients" ADD COLUMN "self_check_predominantly_private" boolean;
ALTER TABLE "clients" ADD COLUMN "self_check_branch_service_area" boolean;
ALTER TABLE "clients" ADD COLUMN "purpose" text;
ALTER TABLE "clients" ADD COLUMN "desired_amount_uzs" numeric(18, 2);
ALTER TABLE "clients" ADD COLUMN "desired_term_months" integer;
ALTER TABLE "clients" ADD COLUMN "preferred_currency" text;

-- Backfill: existing 'questionnaire' status rows become 'lead'.
UPDATE "clients" SET "status" = 'lead' WHERE "status" = 'questionnaire';
