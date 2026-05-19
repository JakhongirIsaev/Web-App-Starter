# Production unification

## Canonical public URLs

- Admin panel: `https://workspaceadmin-production-7e8d.up.railway.app/`
- Telegram mini app: `https://workspacemini-app-production.up.railway.app/`
- API server: `https://workspaceapi-server-production-fce2.up.railway.app/`

The API server no longer acts as a second public frontend host in production.
Requests to `/admin/*` and `/mini-app/*` on the API host redirect to the
canonical standalone services. This prevents the admin panel and mini app from
drifting into different live versions.

## Version and audit checks

- `GET /api/version` reports the API build commit and canonical URLs.
- The admin sidebar shows the frontend build version.
- The mini app profile page shows the frontend build version.
- `pnpm run audit:production` checks the live API, canonical redirects, current
  frontend bundles, and the scoped demo account.

## Demo account

`pnpm run seed:sales-demo` creates or updates a scoped sales demo account:

- Telegram ID: `demo`
- Password: `demo`
- Role: `branch_head`
- Scope: `Minerva Demo Branch`

The account can view the admin Access section and use the mini app against the
demo branch data, including two example clients.
