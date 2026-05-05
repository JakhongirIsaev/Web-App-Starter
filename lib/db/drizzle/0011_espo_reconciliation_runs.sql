CREATE TABLE IF NOT EXISTS "espo_reconciliation_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "ran_at" timestamp NOT NULL DEFAULT NOW(),
  "window_from" timestamp NOT NULL,
  "window_to" timestamp NOT NULL,
  "espo_lead_count" integer NOT NULL,
  "local_lead_count" integer NOT NULL,
  "missing_in_espo" jsonb NOT NULL,
  "missing_in_local" jsonb NOT NULL,
  "notes" text
);
CREATE INDEX IF NOT EXISTS "espo_reconciliation_runs_ran_at_idx" ON "espo_reconciliation_runs" ("ran_at");
