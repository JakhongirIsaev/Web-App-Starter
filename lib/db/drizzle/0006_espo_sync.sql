CREATE TABLE IF NOT EXISTS "espo_sync_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id"),
  "idempotency_key" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "payload_snapshot" jsonb,
  "espo_lead_id" text,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "espo_jobs_status_idx" ON "espo_sync_jobs" ("status");
CREATE INDEX IF NOT EXISTS "espo_jobs_client_id_idx" ON "espo_sync_jobs" ("client_id");
CREATE INDEX IF NOT EXISTS "espo_jobs_idempotency_idx" ON "espo_sync_jobs" ("idempotency_key");

ALTER TABLE "clients" ADD COLUMN "external_uuid" uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "clients" ADD CONSTRAINT "clients_external_uuid_unique" UNIQUE ("external_uuid");
ALTER TABLE "clients" ADD COLUMN "espo_lead_id" text;
ALTER TABLE "clients" ADD COLUMN "espo_synced_at" timestamp;
ALTER TABLE "clients" ADD COLUMN "espo_last_error" text;
