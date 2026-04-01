# Workspace — Minerva / Credit Hunter

## Overview

Minerva is a web admin panel for credit specialists (hunters) and head office managers at SME-focused financial branches. This is a full-stack TypeScript monorepo using pnpm workspaces.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── admin/           # Minerva Web Admin Panel (React + Vite) - served at /
│   └── api-server/      # Express API server - served at /api
├── lib/
│   ├── api-spec/        # OpenAPI spec + Orval codegen config
│   ├── api-client-react/ # Generated React Query hooks
│   ├── api-zod/         # Generated Zod schemas from OpenAPI
│   └── db/              # Drizzle ORM schema + DB connection
├── scripts/             # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema

Tables:
- `branches` — bank branches with name/city/isActive
- `users` — staff with telegramId, role, branchId, passwordHash, isActive
- `product_categories` — categories for credit products
- `products` — credit and non-credit products with limits and interest rates
- `clients` — client sessions with status pipeline and branch assignment
- `articles` — knowledge base articles with branch visibility targeting
- `article_visibility` — maps articles to specific branches
- `activity_log` — audit log of system events

## Role Model

- `superadmin` — Full system access
- `head_office_admin` — Manage products, users, branches, articles
- `editor` — Manage content (articles, products)
- `branch_head` — View their branch only
- `hunter` — Credit specialist (Mini App only, not admin)

## Auth

Session-based (in-memory Map on app.locals.sessions). Login with Telegram ID + password. Token stored in `localStorage` as `auth_token` and sent as Bearer header.

**Demo credentials (password: `password`):**
- Superadmin: Telegram ID `100000001`
- Head Office Admin: `100000002`
- Branch Head (Astana): `100000003`

## API Routes

All routes under `/api`:
- `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET/POST /api/branches`, `GET/PUT/DELETE /api/branches/:id`
- `GET/POST /api/users`, `GET/PUT/DELETE /api/users/:id`, `POST /api/users/:id/activate|deactivate`
- `GET/POST /api/clients`, `GET/PUT /api/clients/:id`
- `GET/POST /api/products`, `GET/PUT/DELETE /api/products/:id`
- `GET/POST /api/product-categories`
- `GET/POST /api/articles`, `GET/PUT/DELETE /api/articles/:id`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/activity`
- `GET /api/dashboard/branch-stats`
- `GET /api/dashboard/client-status`

## Development

```bash
# Run API server
pnpm --filter @workspace/api-server run dev

# Run admin frontend
pnpm --filter @workspace/admin run dev

# Push DB schema changes
pnpm --filter @workspace/db run push

# Regenerate API client after spec changes
pnpm --filter @workspace/api-spec run codegen
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all lib packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- Production migrations are handled by Replit when publishing.
