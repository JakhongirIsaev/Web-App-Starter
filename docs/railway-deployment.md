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

Use the repository root as the working directory for every app service so workspace packages and root Python files stay available.

### `api-server`

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm --filter @workspace/api-server run build`
- Start: `pnpm --filter @workspace/api-server run start`
- Public: `true`
- Port: `PORT`

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
- Build: `pnpm --filter @workspace/admin run build`
- Start: `pnpm --filter @workspace/admin run start`
- Public: `true`
- Port: `PORT`

Required env vars:

- `PORT`
- `BASE_PATH=/`

Recommended env vars:

- `VITE_API_ORIGIN=https://<api-server-public-domain>`

### `mini-app`

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm --filter @workspace/mini-app run build`
- Start: `pnpm --filter @workspace/mini-app run start`
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
- The API process also starts the Telegram bot, so run a single web replica unless you split the bot into its own worker later.
