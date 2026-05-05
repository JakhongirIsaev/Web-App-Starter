# Railway Deployment

## Production services

Keep these repo-backed services:

- `backend-api` -> folder `artifacts/api-server`
- `admin` -> folder `artifacts/admin`
- `miniapp-web` -> folder `artifacts/mini-app`
- `ollama-ai` -> folder `artifacts/ollama-ai`

Remove these repo-backed services:

- `api-spec`
- `api-client-react`
- `api-zod`
- `db`
- `mockup-sandbox`

Create this managed service:

- `PostgreSQL`

Object storage:

- Scanned document images are written to a local volume (`FILE_STORAGE_DIR`,
  default `./uploads`). Mount a Railway volume to that path for persistence.
  External S3/GCS support was removed when the Replit object-storage sidecar
  was retired.

## AI architecture

- The Mini App never talks to Ollama directly.
- `backend-api` calls `ollama-ai` over Railway private networking.
- Use this internal backend env:
  - `OLLAMA_URL=http://ollama-ai.railway.internal:11434`
  - `OLLAMA_MODEL=gemma3:4b`
- Do not add a public domain to `ollama-ai`.
- Mount a persistent Railway volume on `ollama-ai` at `/root/.ollama` so the pulled model survives deploys.

## Railway service settings

Use the repository root as the working directory for every app service so workspace packages, shared libraries, and root Python files stay available.

Do not keep a single root `railway.toml` for this repo — Railway applies a root config to **every** service in the project, which breaks the admin and mini-app services (they would inherit the api-server Dockerfile + `/api/healthz` check and fail to start). Use per-service config files instead and point each Railway service to its own file via **Settings → Config-as-Code Path**:

- `@workspace/api-server` → `artifacts/api-server/railway.toml`
- `@workspace/admin` → `artifacts/admin/railway.toml`
- `@workspace/mini-app` → `artifacts/mini-app/railway.toml`

Each of those files pins the correct Dockerfile, start command, and healthcheck for that service.

### `backend-api`

- Install: `pnpm install --frozen-lockfile`
- Schema setup:
  - Fresh database: `pnpm --filter @workspace/db run push` once, then switch to `migrate`.
  - Existing database: baseline the migrations table per `docs/migrations.md`, then run `pnpm --filter @workspace/db run migrate` on every deploy.
- Build: `pnpm run build:api-server`
- Start: `pnpm run start:api-server`
- Public: `true`
- Port: `PORT`
- Healthcheck path: `/api/healthz`

Required env vars (all environments):

- `PORT`
- `DATABASE_URL`
- `TZ=Asia/Tashkent`

Required in production (process refuses to start without these):

- `NODE_ENV=production`
- `MINI_APP_URL` — public mini-app URL sent to Telegram users.
- `ADMIN_URL` (and/or `EXTRA_CORS_ORIGINS`) — at least one CORS origin must be set.
- `TELEGRAM_WEBHOOK_URL` — public HTTPS webhook endpoint.
- `TELEGRAM_WEBHOOK_SECRET` — verified against `X-Telegram-Bot-Api-Secret-Token`.
- `TELEGRAM_BOT_TOKEN` — required to start the bot / webhook handler.
- `SIGNED_URL_SECRET` — HMAC key for short-lived document image URLs. Generate with `openssl rand -hex 32`. Process refuses to start without it.

Optional env vars:

- `LOG_LEVEL`
- `OLLAMA_URL=http://ollama-ai.railway.internal:11434`
- `OLLAMA_MODEL=gemma3:4b`
- `TRUST_PROXY=true` (or number of hops) behind Railway's proxy.
- `SESSION_TTL_MS` (default 7 days).

### `admin`

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm run build:admin`
- Start: `pnpm run start:admin`
- Public: `true`
- Port: `PORT`

Required env vars:

- `PORT`
- `BASE_PATH=/`
- `TZ=Asia/Tashkent`

Recommended env vars:

- `VITE_API_ORIGIN=https://<api-server-public-domain>`

### `miniapp-web`

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm run build:mini-app`
- Start: `pnpm run start:mini-app`
- Public: `true`
- Port: `PORT`

Required env vars:

- `PORT`
- `BASE_PATH=/`
- `TZ=Asia/Tashkent`

Recommended env vars:

- `VITE_API_ORIGIN=https://<api-server-public-domain>`

### `worker` (Espo sync background process)

A separate Railway service that runs the graphile-worker process for Espo lead syncing. Reuses the api-server image (same repo + Dockerfile) but runs a different start command.

- Source folder: same as api-server (`artifacts/api-server`)
- Builder: same Dockerfile as api-server
- Public: `false` (no inbound HTTP)
- Healthcheck: none (long-running daemon)
- Port: none

Start command override (set in Railway service Settings → Custom Start Command):

```
node --enable-source-maps ./dist/jobs/index.mjs
```

Or use the npm script:

```
pnpm --filter @workspace/api-server run worker
```

Required env vars (mirror api-server):

- `DATABASE_URL` — same Postgres as api-server. graphile-worker creates its own schema (`graphile_worker`) on first run.
- `TZ=Asia/Tashkent`

Required when integrating with live Espo (otherwise stays in stub mode):

- `ESPO_INTEGRATION=live`
- `ESPO_BASE_URL=https://<your-espo-host>`
- `ESPO_API_KEY=<api-token-with-Lead-permissions>`

When `ESPO_INTEGRATION` is unset or `stub`, the worker writes mock IDs (`stub-<uuid>`) without calling Espo — useful for staging.

Provisioning steps:

1. Create a new Railway service in the same project, source the same repo + branch as api-server.
2. Settings → Config-as-Code Path: same `artifacts/api-server/railway.toml` (or override the start command).
3. Settings → Custom Start Command: `pnpm --filter @workspace/api-server run worker`
4. Settings → Disable healthcheck (or set a path that always returns 200 — the worker has no HTTP server).
5. Set env vars per the lists above.
6. Deploy. Watch logs for `info: jobs ready` from graphile-worker.

To verify end-to-end:

- Save a new client via the mini-app.
- Open admin → Espo Sync. Within ~30s, the new job moves from `pending` → `succeeded`.
- In stub mode, `espo_lead_id` starts with `stub-`. In live mode, it's the real Espo Lead ID.

If a deploy is mid-flight when a job fires, the row stays `pending` until the worker boots and polls — graphile-worker re-reads pending rows on startup.

### `ollama-ai`

- Source folder: `artifacts/ollama-ai`
- Builder: `Dockerfile`
- Public: `false`
- Port: `11434`
- Volume mount: `/root/.ollama`

Recommended env vars:

- `OLLAMA_MODEL=gemma3:4b`
- `OLLAMA_HOST=0.0.0.0:11434`
- `OLLAMA_MODELS=/root/.ollama`

## Railway manual actions

1. Keep your current public app services for API and frontends.
2. Create a new service from folder `artifacts/ollama-ai`.
3. Rename services if you want cleaner dashboard names:
   - `@workspace/api-server` -> `backend-api`
   - `@workspace/mini-app` -> `miniapp-web`
4. Open the `ollama-ai` service and add a persistent volume mounted at `/root/.ollama`.
5. Do not assign any public domain to `ollama-ai`.
6. On `backend-api`, set:
   - `OLLAMA_URL=http://ollama-ai.railway.internal:11434`
   - `OLLAMA_MODEL=gemma3:4b`
7. Redeploy `ollama-ai`, wait for the first model pull to complete, then redeploy `backend-api`.
8. Verify public backend health:
   - `GET /api/healthz`
   - `GET /api/ai/health`
9. Redeploy `miniapp-web` after backend AI endpoints are live.
10. Test these flows from the Mini App:
   - questionnaire -> AI-ranked recommendations
   - vehicle photo scan -> structured auto extraction
   - OCR review -> RU/UZ translation
   - PDF generation -> AI offer summary plus Telegram delivery

## Notes

- `db` is a workspace library, not a database service.
- For a brand new Railway PostgreSQL instance, run `pnpm run db:push` once before expecting the API to seed demo data.
- `api-spec`, `api-client-react`, and `api-zod` are codegen/support packages only.
- `mockup-sandbox` is a design/demo artifact and should stay out of production.
- `admin` and `mini-app` now use the checked-in `scripts/serve-spa.mjs` static server in production instead of `vite preview`.
- Use `Asia/Tashkent` as the runtime timezone for all three deployable services so dashboards, exports, and PDFs stay aligned with Uzbekistan time.
- The API process also starts the Telegram bot, so run a single web replica unless you split the bot into its own worker later.
- The `ollama-ai` service keeps models on a volume at `/root/.ollama`; the first deploy will be slower because `gemma3:4b` must be pulled once.
