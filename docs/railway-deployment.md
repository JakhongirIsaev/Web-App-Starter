# Railway Deployment

## Production services

Keep these repo-backed services:

- `api-server`
- `admin`
- `mini-app`

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

## Railway service settings

Use the repository root as the working directory for every app service so workspace packages, shared libraries, and root Python files stay available.

Do not add a single root `railway.toml` for this repo. Each service needs a different build/start command, so Railway should keep those values in the individual service settings.

### `api-server`

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm run build:api-server`
- Start: `pnpm run start:api-server`
- Public: `true`
- Port: `PORT`
- Healthcheck path: `/api/healthz`

Required env vars:

- `PORT`
- `DATABASE_URL`

Optional env vars:

- `MINI_APP_URL`
- `TELEGRAM_BOT_TOKEN`
- `LOG_LEVEL`
- `PUBLIC_OBJECT_SEARCH_PATHS`
- `PRIVATE_OBJECT_DIR`

### `admin`

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm run build:admin`
- Start: `pnpm run start:admin`
- Public: `true`
- Port: `PORT`

Required env vars:

- `PORT`
- `BASE_PATH=/`

Recommended env vars:

- `VITE_API_ORIGIN=https://<api-server-public-domain>`

### `mini-app`

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm run build:mini-app`
- Start: `pnpm run start:mini-app`
- Public: `true`
- Port: `PORT`

Required env vars:

- `PORT`
- `BASE_PATH=/`

Recommended env vars:

- `VITE_API_ORIGIN=https://<api-server-public-domain>`

## Notes

- `db` is a workspace library, not a database service.
- `api-spec`, `api-client-react`, and `api-zod` are codegen/support packages only.
- `mockup-sandbox` is a design/demo artifact and should stay out of production.
- `admin` and `mini-app` now use the checked-in `scripts/serve-spa.mjs` static server in production instead of `vite preview`.
- The API process also starts the Telegram bot, so run a single web replica unless you split the bot into its own worker later.
