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
- `credit_products` — MSME department credit product lineup with segment, SAP code, rates, terms, grace period, purpose, highlight
- `sap_codes` — SAP system product codes registry with status, product type, category
- `credit_lines` — International organization credit line balances with agreement details, disbursement, remaining balance

## Role Model

- `superadmin` — Full system access
- `head_office_admin` — Manage products, users, branches, articles
- `editor` — Manage content (articles, products)
- `branch_head` — View their branch only
- `hunter` — Credit specialist (Mini App only, not admin)

## Auth & RBAC

Session-based (in-memory Map on app.locals.sessions). Login with Telegram ID + password. Token stored in `localStorage` as `auth_token` and sent as Bearer header.

**Auth Middleware** (`artifacts/api-server/src/middleware/auth.ts`):
- `requireAuth` — Validates session token, attaches `req.user`
- `requireRole(...roles)` — Guards routes by role

**Role-Based Access Control:**
- All API routes require authentication via `requireAuth`
- Write operations (create/update/delete) on branches, users require `superadmin` or `head_office_admin`
- Write operations on products/articles also allow `editor`
- `branch_head` users see only their branch's data (clients, dashboard, users)
- Client detail/update enforces branch scope for `branch_head`
- Frontend sidebar filters nav items by role; `/users` and `/branches` routes gated to admin roles
- Client reassignment available via dialog on client detail page

**Activity Logging** (`artifacts/api-server/src/middleware/activity.ts`):
- All CRUD operations log to `activity_log` table with user, entity, and branch context
- Client status changes and reassignments are logged separately

**Demo credentials (password: `password`):**
- Superadmin: Telegram ID `100000001`
- Head Office Admin: `100000002`
- Branch Head (Astana): `100000003`

## API Routes

All routes under `/api`, all require Bearer token auth:
- `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET/POST /api/branches`, `GET/PUT/DELETE /api/branches/:id` (write: admin only)
- `GET/POST /api/users`, `GET/PUT/DELETE /api/users/:id`, `POST /api/users/:id/activate|deactivate` (read: admin+branch_head, write: admin only)
- `GET/POST /api/clients`, `GET/PUT /api/clients/:id` (branch-scoped for branch_head)
- `GET/POST /api/products`, `GET/PUT/DELETE /api/products/:id` (write: admin+editor)
- `GET/POST /api/product-categories` (write: admin+editor)
- `GET/POST /api/articles`, `GET/PUT/DELETE /api/articles/:id` (write: admin+editor)
- `GET /api/dashboard/summary|activity|branch-stats|client-status` (branch-scoped for branch_head)
- `GET/POST /api/credit-products`, `PUT/DELETE /api/credit-products/:id`, `POST /api/credit-products/import` (read: all, write: admin+editor, delete/import: admin)
- `GET/POST /api/sap-codes`, `PUT/DELETE /api/sap-codes/:id`, `POST /api/sap-codes/import` (read: all, write: admin+editor, delete/import: admin)
- `GET/POST /api/credit-lines`, `PUT/DELETE /api/credit-lines/:id`, `POST /api/credit-lines/import` (read: all, write: admin+editor, delete/import: admin)

## i18n (Internationalization)

The admin panel supports Russian (default) and Uzbek languages.
- **Library**: i18next + react-i18next
- **Config**: `artifacts/admin/src/i18n/index.ts`
- **Translation files**: `artifacts/admin/src/i18n/ru.json`, `artifacts/admin/src/i18n/uz.json`
- **Language switcher**: Header button toggles between RU/UZ, stored in `localStorage` as `minerva_lang`
- All UI strings wrapped in `useTranslation()` / `t()` calls

## CSV Import/Export

All data pages (Clients, Products, Articles, Users, Branches) have Export and Import buttons.
- **Export**: Frontend-only, downloads CSV with BOM for Excel compatibility, formula injection protection (prefixes dangerous chars with `'`)
- **Import**: File upload via `multer`, parsed with `csv-parse`, wrapped in DB transactions (all-or-nothing), returns `{ imported, skipped }` counts
- **Shared utilities**: `artifacts/admin/src/lib/csv.ts` (frontend), `artifacts/api-server/src/lib/csv.ts` (backend)
- **Import endpoints**: `POST /api/{resource}/import` (superadmin/head_office_admin only)
- Users import requires `password` column (no default passwords)

## Frontend Pages

All pages have full CRUD functionality with dialog modals:
- **Dashboard** (`/`) — Metrics, activity feed, branch stats, client status chart
- **Clients** (`/clients`) — Paginated list with filters, click to view detail, CSV export/import
- **Client Detail** (`/clients/:id`) — Status pipeline, assignment info, status update, reassignment dialog
- **Products** (`/products`) — Table with Add/Edit/Delete via dialogs, filter by type/category, client-side search, CSV export/import
- **Branches** (`/branches`) — Card grid with Add/Edit/Delete, active/inactive toggle (admin only), CSV export/import
- **Users** (`/users`) — Table with Add/Edit/Activate/Deactivate, role/branch filters, client-side search (admin only), CSV export/import
- **Articles** (`/articles`) — Card grid with Create/Edit/Delete, published/draft tabs, branch targeting, CSV export/import
- **Credit Products** (`/credit-products`) — MSME department product lineup, expandable rows, segment filter, CSV export/import
- **SAP Codes** (`/sap-codes`) — SAP product codes registry, status filter, CSV export/import
- **Credit Lines** (`/credit-lines`) — International credit line balances, expandable rows, currency filter, CSV export/import

## Auto-Seeding

`artifacts/api-server/src/seed.ts` runs on startup — seeds demo data if `users` table is empty. This ensures the published/production version also gets demo data on first deploy.

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
