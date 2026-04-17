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

Recommended external dependency:

- S3-compatible or GCS object storage for scanned document images

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
- First deploy against a fresh database: `pnpm run db:push`
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

Optional env vars:

- `LOG_LEVEL`
- `OLLAMA_URL=http://ollama-ai.railway.internal:11434`
- `OLLAMA_MODEL=gemma3:4b`
- `PUBLIC_OBJECT_SEARCH_PATHS`
- `PRIVATE_OBJECT_DIR`
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
