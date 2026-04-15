# Database migrations

## Current state

`lib/db` currently supports two flows:

- `pnpm --filter @workspace/db run push` — live-applies the schema (no history, used historically)
- `pnpm --filter @workspace/db run generate` — emits a new SQL migration under `lib/db/drizzle/` (preferred)
- `pnpm --filter @workspace/db run migrate` — runs pending migrations against `DATABASE_URL`

`drizzle/` already contains:

- `0000_phase10_indexes.sql`
- `0001_password_reset_tokens.sql`

with matching `meta/_journal.json` and snapshots.

## Moving prod from `push` to `migrate`

The existing production database was built via `push`, so its schema matches
the state the two migrations *would* produce, but the
`__drizzle_migrations` bookkeeping table does not exist yet. Running `migrate`
directly against prod would try to re-apply `0000` and `0001` and fail.

### One-time baseline (per environment)

Connect to the target Postgres and mark the two existing migrations as
already applied:

```sql
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

-- Hashes must match the ones in lib/db/drizzle/meta/_journal.json
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT j->>'hash', (j->>'when')::bigint
FROM json_array_elements(
  (SELECT entries::json FROM (VALUES ('[...paste _journal.json entries...]'::text)) t(entries))
) AS j
ON CONFLICT DO NOTHING;
```

Easier alternative: let `drizzle-kit migrate` write its own journal by
pointing it at an empty staging DB first, then copy the migrations table
into prod.

### Post-baseline workflow

1. Edit `lib/db/src/schema/*.ts`
2. `pnpm --filter @workspace/db run generate` → new `00XX_*.sql`
3. Commit the SQL + updated snapshot
4. Deploy; `migrate` runs at boot and applies only new files

### Wiring into startup (deferred)

Once every environment is baselined, add this line to
`artifacts/api-server/start.sh` before the final `exec`:

```sh
pnpm --filter @workspace/db run migrate
```

Until then, run `migrate` manually against each environment after baselining.

## Rollback

Drizzle does not generate down-migrations. For a failed deploy:

1. Revert the offending migration SQL + schema commit
2. Write a forward-fix migration that undoes the change
3. Redeploy

Never edit an already-applied migration file.
