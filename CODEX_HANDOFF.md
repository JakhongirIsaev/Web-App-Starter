# Codex Handoff — Minerva (May 2026)

**Read this file first.** It captures the May 2026 session that landed 23 PRs across Phases A–D. Pair it with `AGENTS.md` (rules) and the spec/plan docs in `docs/superpowers/`.

---

## TL;DR — Current State (2026-05-06)

- **Branch:** `main`. Latest tag: `v3.0.0`. Production deploys from `main` to Railway.
- **23 PRs merged this session.** All four phases complete:
  - **Phase A** — RBAC permissions, 1-page leave-behind PDF, Cloudflare R2 storage, Espo lead sync (stub mode)
  - **Phase B** — Admin "Credit Policy Parameters" page, AI surfaces replaced with rules/templates, fixed client form replaces multi-step questionnaire, Ollama service decommissioned, questionnaire tables archived
  - **Phase C** — admin button cleanup, send-PDF-via-Telegram, daily reminder worker, "My day" widget, branch-head Funnel report, rapid lead-capture FAB
  - **Phase D** — bilingual PDF (per-client language), HTML5 signature pad on new-client form, nightly Espo reconciliation, IndexedDB offline queue with auto-sync
  - **Idempotency follow-up** — `clients.external_uuid` + `ON CONFLICT DO NOTHING` on POST `/mini-app/clients`
  - **2 QA-found bugs** — admin logo BASE_URL, CSP for telegram-web-app.js (PRs #22, #23)
- **All 23 PRs visible** at https://github.com/JakhongirIsaev/Web-App-Starter/pulls?q=is%3Amerged
- **Tags shipped:** `v2.0.0-pre-may-2026` (rollback target), `v2.5.0` (Phase A), `v2.7.0` (Phase B), `v2.8.0` (Phase C), `v2.9.0` (Phase D), `v3.0.0` (everything)

---

## Repo Layout (pnpm workspace)

```
D:\Minerva\web-app-starter\
├── artifacts/
│   ├── api-server/         Express 5 + drizzle + grammy. Mounts /mini-app/ and /admin/. The product server.
│   ├── mini-app/           React 19 + Vite. Telegram Mini App. Mounted at /mini-app/* by api-server.
│   ├── admin/              React 19 + Vite. Admin panel. Mounted at /admin/* by api-server.
│   └── ollama-ai/          REMOVED in Phase B4 — do not re-add
├── lib/
│   ├── db/                 Drizzle schema + migrations (single source of truth for data shape)
│   ├── api-spec/           OpenAPI YAML (single source of truth for API)
│   ├── api-zod/            Auto-generated Zod validators (orval-generated) + hand-edited mini-app.ts
│   └── api-client-react/   Auto-generated React Query hooks
└── docs/
    ├── superpowers/specs/2026-05-05-minerva-changes-design.md      ← FULL SPEC
    ├── superpowers/plans/2026-05-{05,06}-minerva-phase-{a,b,c,d}-plan.md
    ├── phase-a-completion.md  ← user-facing completion summary
    ├── railway-deployment.md  ← Railway service runbook (read this for env vars)
    ├── roles-and-permissions.md  ← RBAC matrix (auto-generated)
    └── migrations.md           ← drizzle migration runbook
```

api-server **serves both the mini-app and admin SPAs** via `mountSpa` calls in `app.ts`. The standalone `mini-app` and `admin` Railway services exist but are mostly redundant — production traffic goes through api-server.

---

## What's New Since May 2026

### Phase A (PRs #2–#5)

- **RBAC** — `artifacts/api-server/src/rbac/{permissions.ts, role-permissions.ts}`. Use `requirePermission("...")` middleware on routes, NOT inline role-name checks. Matrix at `docs/roles-and-permissions.md`.
- **PDF redesign** — `artifacts/api-server/src/pdf/leave-behind.ts` is the new generator. 1-page A4, RU/UZ, requires `users.phone` for the assigned credit expert. Both `POST /generate-pdf` and `GET /download-pdf` use it. Bundled DejaVuSans fonts in `artifacts/api-server/fonts/`.
- **Cloudflare R2** — `artifacts/api-server/src/storage/r2-client.ts`. Toggled by env `STORAGE_BACKEND=r2`. Default falls back to local-FS. R2 vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`. Already set up and working in production.
- **Espo sync (stub mode)** — `artifacts/api-server/src/integrations/espo/`. graphile-worker process at `src/jobs/index.ts` polls `espo_sync_jobs` table. Idempotent on `clients.external_uuid`. Stub returns `stub-<uuid>` IDs. Activate live by setting `ESPO_INTEGRATION=live`, `ESPO_BASE_URL`, `ESPO_API_KEY` on **both** `backend-api` and the worker service.

### Phase B (PRs #6–#8, B3a, B4)

- **Credit Policy Parameters** — `artifacts/api-server/src/lib/policy-params.ts` defines `PolicyParams` interface + `getActivePolicyParams()` (60s in-memory cache). Versioned via `policy_param_versions` table. Admin UI at `/admin/credit-policy` with 29 numeric inputs.
- **Rule engine (DORMANT)** — `artifacts/api-server/src/lib/recommend-engine.ts` is built and tested but **not used in production yet**. Reason: `credit_products` table stores rates as text (`rate_uzs: text`), not numeric. To activate, migrate the rate columns to numeric and rewrite `/ai/recommend-products` to use the engine. Logged as task in chat history.
- **Static templates replaced AI** — `lib/offer-summary.ts` (RU/UZ string template). All AI endpoints in `routes/ai.ts` were deterministic stubs at end of B1; B4 deleted the whole file.
- **Fixed client form** — `mini-app/pages/new-client.tsx` has 6 sections: Identity, Lead source (chips), Referrer (conditional), Loan intent, Self-check (4 booleans), Consent signature. Auto-promotes to `status="lead"` when all self-checks true + intent fields filled.
- **Questionnaire archived** — `questionnaire_sessions` and `questionnaire_answers` renamed to `archived_*` in migration 0012. Status enum dropped `"questionnaire"`. Old URL `/questionnaire/:id` redirects to `/clients/:id`.
- **Ollama decommissioned** — `artifacts/ollama-ai/`, `src/ai/`, `routes/ai.ts` all removed. **Manual Railway cleanup still required:** delete the `ollama-ai` service + its `/root/.ollama` volume + `OLLAMA_*` env vars from `backend-api`. Saves ~$15-30/mo.

### Phase C (PRs #9–#14)

- **C5 button cleanup** — `artifacts/admin/src/components/toolbar-overflow.tsx` — 3-dot dropdown for Import/Export/Template on 4 admin list pages.
- **C4 send-PDF-via-Telegram** — `POST /mini-app/clients/:id/send-pdf-to-lead`. Tries Telegram (`clients.telegram_username`), falls back to `wa.me/<phone>` URL.
- **C6 reminders** — `artifacts/api-server/src/jobs/daily-reminder-scan.ts`. graphile-worker cron `0 4 * * *` (= 09:00 Asia/Tashkent). Sends Telegram message to assigned expert for each due `client_next_actions` row.
- **C2 my-day widget** — `GET /mini-app/dashboard/me` + inline render in `mini-app/pages/home.tsx`. Today/week counts + 7-day funnel.
- **C3 funnel report** — `artifacts/admin/src/pages/funnel.tsx` + `routes/admin-reports.ts`. Branch/source/date filters, CSS bar chart.
- **C1 quick lead-capture** — `mini-app/pages/quick-lead.tsx`. One-screen capture: photo, name, phone, business chips, GPS, save. FAB on home (green Zap icon).

### Phase D (PRs #15, #16, #17, #18, #19)

- **D2 bilingual PDF** — `clients.preferred_language` column. PDF endpoints prefer client's saved language over request body.
- **D3 signature** — `mini-app/components/signature-pad.tsx` (DPR-aware HTML5 canvas, pointer events). Required on new-client form. Persisted as `client_documents` row with `doc_type="consent_signature"`. Auto-displays in admin photo gallery.
- **D4 Espo reconcile** — `jobs/espo-reconcile.ts`. graphile-worker cron `30 4 * * *` (= 09:30 Asia/Tashkent). Diffs Espo's last 24h leads vs local `clients.espoLeadId`. Records discrepancies in `espo_reconciliation_runs` table. Surfaced on admin Espo Sync page.
- **D1 offline mode** — `mini-app/lib/{offline-queue.ts, sync-runner.ts, use-online.ts}` + `components/offline-badge.tsx`. IndexedDB queue + drain on `online` event. New-client + quick-lead saves use `postOrQueue()` wrapper. Photos/signatures still require online.

### Idempotency follow-up (PR #20)

- `clients.external_uuid` is now optionally caller-supplied. Server uses `db.insert(...).onConflictDoNothing({ target: clientsTable.externalUuid }).returning()`; on conflict returns existing row (idempotent replay). Mini-app `postOrQueue` injects `crypto.randomUUID()` for create-client calls.

### QA fixes (PRs #22, #23)

- Admin logo `<img src>` uses `${import.meta.env.BASE_URL}filename.png` (resolves under `/admin/`)
- CSP `script-src` allows `https://telegram.org` for the WebApp SDK script

---

## How We Work — Conventions

### Branch flow

- `main` is integration AND production-deploy. Railway auto-deploys on push.
- Per-feature branches: `feat/<scope>-<short>`. Spec/plan branches: `claude/spec-...` or similar.
- PR back to `main`. Tag `v2.x.0` on `main` BEFORE risky merges for rollback.
- Rollback procedure: `git revert -m 1 <merge-sha>` on `main`, push.

### Commit style

- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, `perf:`, `build:`
- Sub-scope optional: `feat(rbac): ...`, `fix(qa): ...`
- Co-author trailer used in CI (`Co-Authored-By: ...`) — keep if commits are AI-assisted.
- Body: explain WHY, not WHAT. Mention the spec section / phase if relevant.

### Migrations

- Schema in `lib/db/src/schema/*.ts` (drizzle).
- Generate: `pnpm --filter @workspace/db drizzle-kit generate`. Falls back to manually writing SQL + snapshot + journal entry when the codegen tool can't run (sandbox quirks).
- Run on Railway via Pre-deploy Command: `pnpm --filter @workspace/db run migrate`. Already wired.
- **Migration files are immutable once shipped.** If you need a fix, write a NEW migration.
- Snapshot/journal pattern: each migration `00NN_name.sql` has matching `meta/00NN_snapshot.json` (id chain via `prevId`) and an entry in `meta/_journal.json`. The journal `idx` increments by 1, `tag` matches the SQL filename.

### OpenAPI + generated clients

- Source of truth: `lib/api-spec/openapi.yaml`.
- Regenerate: `pnpm --filter @workspace/api-zod run codegen` and `pnpm --filter @workspace/api-client-react run codegen`.
- When codegen can't run (sandbox), hand-edit the generated files. Run codegen on a clean checkout to verify zero drift before merging if you can.
- `lib/api-zod/src/mini-app.ts` is **hand-maintained** (not orval-generated). Update it when changing mini-app endpoints' request/response shapes.

### Permissions

- All protected routes use `requirePermission("scope.action")` middleware from `artifacts/api-server/src/middleware/auth.ts`.
- Permissions defined in `artifacts/api-server/src/rbac/permissions.ts` (PERMISSIONS readonly tuple + Permission type).
- Role mappings in `rbac/role-permissions.ts`.
- DO NOT add inline `if (user.role === "X")` checks. If filtering data by role (e.g., `branch_head` sees only their branch), keep the check but annotate: `// data-scope filter — not authorization`.
- Regenerate `docs/roles-and-permissions.md` after changes: `pnpm --filter @workspace/api-server run render:permissions-doc` (script at `artifacts/api-server/scripts/render-permissions-doc.ts`).

### Storage

- Uploads go through `POST /storage/uploads/direct` (image data URL) or `POST /storage/upload-document` (multipart).
- Backend env-flagged: `STORAGE_BACKEND=r2` for Cloudflare R2 (active in prod), default `local-fs`.
- All persisted files have a row in `client_documents` with `storage_path` set to the R2 key (or local path).
- Frontend access via `getSignedImageUrl(path)` helper — handles both legacy local-FS and R2 paths.
- Photo display: `client_documents.docType` discriminates; `mimeType.startsWith("image/")` or `docType in {photo_storefront, photo_owner, consent_signature}` shows in galleries.

### Internationalization

- RU + UZ. Bundles at `artifacts/{mini-app,admin}/src/i18n/{ru,uz}.json`.
- Always add new strings to BOTH bundles (unbalanced bundles break the i18next fallback).
- Per-client preferred language stored in `clients.preferred_language` (D2). PDFs render in that language.

### Worker / cron jobs (graphile-worker)

- Tasks in `artifacts/api-server/src/jobs/*.ts`.
- Registered in `src/jobs/index.ts` (taskList + crontab).
- Runs as a **separate Railway service** (`@workspace/worker`) with start command `pnpm --filter @workspace/api-server run worker`. Same DATABASE_URL as backend-api.
- Current tasks: `espo-sync` (event-driven), `daily-reminder-scan` (cron 04:00 UTC), `espo-reconcile` (cron 04:30 UTC).

---

## Production Deployment (Railway)

### Services
| Service | Source | Public | Notes |
|---|---|---|---|
| `backend-api` | `artifacts/api-server` | yes | Serves API + mini-app SPA + admin SPA |
| `worker` | `artifacts/api-server` (same image, different start command) | no | graphile-worker daemon |
| `mini-app` | `artifacts/mini-app` | yes (mostly redundant) | Standalone SPA host |
| `admin` | `artifacts/admin` | yes (mostly redundant) | Standalone SPA host |
| Postgres | managed | — | DATABASE_URL inherited |

Railway runs migrations via the Pre-deploy Command on `backend-api` (`pnpm --filter @workspace/db run migrate`).

Deploy on push to `main`. Railway auto-detects.

Dockerfiles use `pnpm install --no-frozen-lockfile` because lockfile drift was a recurring issue during the May session. If you stabilize lockfile generation, switch back to `--frozen-lockfile` for stricter CI.

### Critical env vars

```
# Always required on backend-api + worker
DATABASE_URL              (managed by Railway)
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
SIGNED_URL_SECRET         (HMAC for legacy signed URLs)
TZ=Asia/Tashkent

# R2 storage (active)
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET=minerva-prod-uploads
R2_PUBLIC_BASE_URL=https://pub-46049e46ba7d4dffbd889bf9af9f8f8c.r2.dev
STORAGE_BACKEND=r2

# Espo (stub by default)
ESPO_INTEGRATION=stub          # set to "live" + add the next 2 to activate
# ESPO_BASE_URL=https://...
# ESPO_API_KEY=...
```

R2 token rotation: user declined for now. The token shown in chat history is still active.

### Manual cleanup user still owes (NOT YET DONE)

1. Delete `ollama-ai` Railway service + its volume mount `/root/.ollama` + `OLLAMA_*` env vars from `backend-api`. Saves ~$15-30/mo.
2. Each credit expert must set their phone in admin → Users → edit. Required for PDF generation (PDF refuses to render without expert phone).

---

## Open Follow-ups

### Important
1. **Connect rule engine to live recommendations** — `lib/recommend-engine.ts` is tested + dormant. Activation requires migrating `credit_products` rate columns from text → numeric. Two options:
   - Option A — manual: admin re-enters all products with numeric fields. Annoying.
   - Option B — best-effort parser: parse "от 24%" / "24-26% годовых" / "до 36 мес" strings into numerics. Fragile.
   - Either way, also rewrite `/ai/recommend-products` route handler to call `recommendProducts({ products, params, client })`. Until then, the deterministic ranking in `routes/recommend.ts` (knowledge-match based) is what runs.

2. **Activate live Espo** — once user has the API token, set `ESPO_INTEGRATION=live` + `ESPO_BASE_URL` + `ESPO_API_KEY` on `backend-api` AND the worker service. Stub-mode jobs auto-replay the writes once live mode is on.

### Cosmetic / nice-to-have
3. **Empty state polish** for `/admin/funnel` and `/admin/espo-sync` — currently show empty card placeholders when underlying tables are empty. Replace with "No data yet — first leads will appear here" copy.
4. **Mobile FAB pattern** for admin list pages — Phase C5 added an inline primary button + overflow. The original spec mentioned moving primary to bottom-right FAB on `<600px` viewports. Skipped for time; do if you want polish.
5. **Restore Pre-deploy Command** to whatever it was before — currently runs migrations on every deploy. Idempotent (Drizzle skips applied migrations) but wastes ~3s/deploy.
6. **R2 token rotation** — user explicitly declined. If you want to nag again, do it gently.

### Tech debt
7. **`pnpm-lock.yaml`** — sometimes drifts because the user's local pnpm install hits Windows symlink quirks. Dockerfile already uses `--no-frozen-lockfile`. If you stabilize this on a machine with working pnpm, switch back to `--frozen-lockfile`.
8. **Generated zod/types drift** — several phases hand-edited `lib/api-zod/src/generated/*` because codegen was sandbox-blocked. Run `pnpm codegen` on a clean checkout and commit any drift.

---

## Known Sandbox Quirks (you may not hit these on Linux)

These bit my session repeatedly. If you're on Mac/Linux, you probably won't see them. On Windows + the harness:

- **`pnpm install`** — works partially, then fails on `UNKNOWN: open '...node_modules/.pnpm/.../package.json'` errors mid-traversal. Cause: Windows symlinks + AV scanning. Workaround: nuke `node_modules` and retry, or just push the lockfile and let Railway install in clean Linux.
- **`pnpm exec tsc` / `vitest`** — fail with `Cannot find module 'vitest'` or `Cannot find type definition file for 'node'`. Same root cause.
- **`drizzle-kit generate`** — fails with `Cannot find module 'esbuild'`. When this happens, hand-write the migration SQL + snapshot.json + journal entry. Pattern is documented in this file's "Migrations" section.
- **`gh pr` and `git push`** — sometimes hang in the first attempt then succeed silently in the background. If a PR doesn't show up in `gh pr list`, retry the push synchronously and check again.

---

## Domain Glossary

- **IPAK YO'LI Bank** — Uzbek SME-focused bank. Real client.
- **Credit expert** — bank employee who finds leads in markets, mahallas, shops; uses the mini-app.
- **Mini-app** — Telegram WebApp at `/mini-app/`. Used by credit experts in the field.
- **Admin** — web panel at `/admin/`. Used by branch heads, head office, superadmins.
- **Lead → application → approval → disbursement** — the funnel. Status enum reflects this.
- **EspoCRM** — bank's CRM. Bank pays credit experts based on lead count there. Revenue-critical integration.
- **Roles** — `superadmin`, `head_office_admin`, `editor`, `branch_head`, `hunter` (the credit expert).
- **"Hunter"** — slang for credit expert (the original code uses this). Synonymous with credit expert.
- **Mahalla** — Uzbek neighborhood/community.
- **KP / "КП"** — "Коммерческое предложение" = commercial offer = the leave-behind PDF.

---

## How to Continue

If the user gives you a request:

1. **Check this file's "Open follow-ups"** first — they may be asking for one of those.
2. **Read the design spec** (`docs/superpowers/specs/2026-05-05-minerva-changes-design.md`) for context on Phase E and beyond.
3. **Follow the conventions above**: branch off `main`, conventional commits, schema migrations include snapshot+journal, OpenAPI is source of truth.
4. **Don't reintroduce AI/Ollama** — Phase B4 explicitly removed it.
5. **Don't reintroduce the questionnaire flow** — Phase B3 replaced it with the fixed form.
6. **Communication style with the user**: they're a non-programmer enthusiast. Use plain language, batch decisions, don't ask permission for routine ops, be direct. They prefer "carry on" / autonomous execution.

---

## Quick Reference

```bash
# Build everything
pnpm install
pnpm build

# Run a service locally (api-server serves mini-app + admin too)
pnpm --filter @workspace/api-server dev

# Run worker locally (separate process)
pnpm --filter @workspace/api-server run worker

# Generate a new migration
pnpm --filter @workspace/db drizzle-kit generate

# Apply migrations (Railway runs this automatically)
pnpm --filter @workspace/db run migrate

# Regenerate API clients
pnpm --filter @workspace/api-zod run codegen
pnpm --filter @workspace/api-client-react run codegen

# Run tests
pnpm --filter @workspace/api-server test
```

---

*Generated 2026-05-06 at the end of a 23-PR session. Hand off ready.*
