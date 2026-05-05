CREATE TABLE IF NOT EXISTS "policy_param_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "version" text NOT NULL,
  "effective_from" timestamp NOT NULL,
  "effective_to" timestamp,
  "value" jsonb NOT NULL,
  "created_by" integer REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "policy_param_versions_effective_idx" ON "policy_param_versions" ("effective_from");
