# Workspace — Minerva / Credit Hunter

## Overview

Minerva is a full-stack platform for Ipak Yuli Bank with two products: (1) **Admin Web Panel** for head office management, and (2) **Telegram Mini App** for credit experts (field specialists). Both share the same API server and database. Full-stack TypeScript monorepo using pnpm workspaces.

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
│   ├── mini-app/        # Minerva Telegram Mini App (React + Vite) - served at /mini-app/
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
- `articles` — knowledge base articles with category (general/onboarding/sap/documents/credit_process/faq) and branch visibility targeting
- `article_visibility` — maps articles to specific branches
- `activity_log` — audit log of system events
- `credit_products` — MSME department credit product lineup (20 products × 3 segments = 60 rows) with segment, SAP code, rates, terms, grace period, purpose, highlight
- `sap_codes` — SAP system product codes registry with status, product type, category
- `credit_lines` — International organization credit line balances with agreement details, disbursement, remaining balance

**Mini App Tables** (schema: `lib/db/src/schema/mini-app.ts`):
- `client_notes` — Notes on clients by credit experts
- `client_next_actions` — Scheduled follow-up actions for clients
- `questionnaire_sessions` — Questionnaire sessions linking client to expert
- `questionnaire_answers` — Individual answers within a questionnaire session
- `baskets` — Product baskets for clients (selected recommended products)
- `basket_items` — Individual items in a basket
- `calculations` — Saved loan calculations with full payment schedules (JSON)
- `client_documents` — Scanned document images with OCR text and extracted fields (JSON)

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

### Mini App API Routes (all under `/api/mini-app/`)
- `GET /api/mini-app/dashboard` — Personal stats (totalClients, clientsToday, statusBreakdown)
- `GET /api/mini-app/todo` — Daily to-do list (pending follow-ups, overdue actions)
- `GET/POST /api/mini-app/clients` — Hunter's client list with CRM fields
- `GET/PUT /api/mini-app/clients/:id` — Client detail + update
- `POST /api/mini-app/clients/:id/notes` — Add client notes
- `POST /api/mini-app/clients/:id/next-action` — Schedule next action for client
- `POST /api/mini-app/questionnaire/start` — Start questionnaire session for client
- `PUT /api/mini-app/questionnaire/:sessionId/answer` — Submit answer
- `GET /api/mini-app/questionnaire/:sessionId/result` — Get questionnaire result
- `GET /api/mini-app/recommendation/:sessionId` — Rule-based product recommendation
- `GET/POST /api/mini-app/basket` — Manage product basket
- `DELETE /api/mini-app/basket/:itemId` — Remove basket item
- `POST /api/mini-app/calculator` — Calculate loan schedule (annuity/differentiated)
- `GET /api/mini-app/calculations` — Saved calculation history
- `GET /api/mini-app/articles` — Knowledge base articles
- `GET /api/mini-app/branch-summary` — Branch head summary (branch_head role only)

## i18n (Internationalization)

Both admin panel and Mini App support Russian (default) and Uzbek languages.

**Admin Panel:**
- **Config**: `artifacts/admin/src/i18n/index.ts`
- **Translation files**: `artifacts/admin/src/i18n/ru.json`, `artifacts/admin/src/i18n/uz.json`
- **Language key**: `localStorage` as `minerva_lang`

**Mini App:**
- **Config**: `artifacts/mini-app/src/i18n/index.ts`
- **Translation files**: `artifacts/mini-app/src/i18n/ru.json`, `artifacts/mini-app/src/i18n/uz.json`
- **Language key**: `localStorage` as `minerva_miniapp_lang`

Both use i18next + react-i18next with `useTranslation()` / `t()` calls.

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

## Mini App Pages

Mobile-first screens for credit experts (served at `/mini-app/`):
- **Login** — Telegram ID + password auth, green branding
- **Home** — Greeting, quick actions (4 buttons), personal stats, today's to-do
- **Clients** — Client list with search, add new client button
- **New Client** — Client creation form with CRM fields
- **Client Detail** — Client info, notes, next actions, scanned documents, start questionnaire
- **Scan Document** — Camera-first multi-photo scanning with PaddleOCR server-side OCR (Russian lang); capture multiple photos, batch-process OCR, review combined results, extracts fields (name, passport, phone, VIN, etc.), saves all images + data to DB
- **Questionnaire** — 6-step questionnaire (business_type, size, need_type, purpose, amount, term)
- **Recommendation** — Rule-based product recommendations from questionnaire results
- **Products** — Browse credit products catalog
- **Calculator** — Full loan calculator matching bank reference: credit type selector, product cost with down payment %, auto-calculated loan amount, interest rate (annual/monthly), grace period, annuity/differentiated repayment, payment schedule with actual dates (DD.MM.YYYY format)
- **Knowledge** — Articles / knowledge base
- **Layout** — Bottom navigation with 5 tabs: Home, Clients, Products, Calculator, Knowledge

Mini App auth token stored in `localStorage` as `miniapp_auth_token`.

## OCR (PaddleOCR)

- **Engine**: PaddleOCR 2.9.1 + PaddlePaddle 2.6.2 (Python, server-side)
- **Script**: `artifacts/api-server/src/ocr/paddle_ocr.py`
- **API endpoint**: `POST /api/ocr/recognize` — accepts `{ image: "base64..." }`, returns `{ text, boxes }`
- **Language**: Russian (`lang="ru"`)
- **Flow**: Mini App sends base64 image → API server spawns Python subprocess → PaddleOCR processes → returns recognized text + confidence scores
- **System deps**: `gomp` (OpenMP runtime), `libGL`, `glib` — required for PaddlePaddle/OpenCV
- **LD_LIBRARY_PATH**: gcc lib path set in spawn env for `libgomp.so.1`

## Telegram Bot Integration

- **Bot**: `@minerva_1_bot` (grammy framework, long-polling)
- **Bot code**: `artifacts/api-server/src/bot.ts`
- **Secret**: `TELEGRAM_BOT_TOKEN` (stored in Replit Secrets)
- **Commands**: `/start` (opens Mini App), `/stats` (personal metrics), `/clients` (client list), `/todo` (pending tasks), `/help` (shows help text)
- **Document sending**: `sendDocument()` function sends PDF files to users via bot chat
- **PDF Generation**: `POST /api/mini-app/clients/:id/generate-pdf` — generates commercial proposal PDF with client info, basket products, calculations; auto-sends via Telegram bot to expert's chat
- **PDF Download**: `GET /api/mini-app/clients/:id/download-pdf` — downloads PDF directly
- **Auto-login**: When opened inside Telegram, the Mini App detects `window.Telegram.WebApp.initData`, sends it to `POST /api/auth/telegram` for HMAC-SHA256 validation, and auto-authenticates the user if their Telegram ID is registered
- **Fallback**: If Telegram auth fails (unregistered user), shows manual login form with error message
- **Telegram WebApp SDK**: Loaded via `<script>` in `artifacts/mini-app/index.html`

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
