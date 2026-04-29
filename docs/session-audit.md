# Session audit — full inventory of work + handoff

**Repo:** `JakhongirIsaev/Web-App-Starter`
**Branch:** `main` — everything pushed
**Working tree:** clean
**Test totals:** 89 → 185 (+96)
**Lint:** 0 errors, 18 warnings (down from 65)
**Typecheck:** 4/4 packages clean

This document is the durable record of work done across this session and the prior collaboration sessions. It exists so a fresh Claude session, or a reviewer (Codex), or you weeks from now can pick up the thread without re-reading chat history.

---

## 1. Commit log

Listed chronologically. The "author" column distinguishes **Claude** (me) from **Codex** (the parallel agent) so reviewers can route questions correctly.

| Commit | Author | What |
|---|---|---|
| (pre-session) | mixed | Original codebase + initial audits + collateral feature spec v3 |
| `f975894` | Claude | feat: collateral qualification calculator + repo cleanup (Phases 1-7 in one shot) |
| `a0a7e0f` | Claude | fix(seed): collateral reference data must seed on every prod boot — moved `seedCollateralReferenceData()` out from under the `SEED_DATABASE_ON_BOOT` gate |
| `2b61268` | Codex | fix: harden collateral estimate flow — DB transaction, ID validation, currency check, rounded comparison for `resultStatus` |
| `eb75310` | Codex | chore: add collateral seed runbook script (`scripts/seed:collateral-reference`) |
| `a175647` | Codex | fix: sanitize telegram webhook errors |
| `4db5cc5` | Codex | feat(mini-app): harden routes + speed up questionnaire + visibility polish (auth guards, Zod schemas across 11 routes, deterministic-first questionnaire, gender filter, business location persistence, prominent collateral CTA, dashboard filter fix) |
| `807d716` | Claude | feat(admin): row-level overflow `...` menus across 7 admin pages via `<RowActions>` |
| `b2d02b2` | Claude | feat(admin): edit client details dialog (full name / phone / gender / clientType / clientSegment) |
| `739417e` | Claude | feat(admin): knowledge base — `recommendation_documents` table, migration `0003`, admin UI page, 4 routes |
| `a7fe9a6` | Claude | feat(admin): client CSV import — `?dryRun=1` backend + admin preview Dialog with per-row OK/error status |
| `d75c73a` | Claude | feat(admin): paginated activity log audit page — filterable by type / user / date, expandable JSON metadata cell |
| `6bf553d` | Claude | feat: KB → recommendation integration (`lib/knowledge-match.ts`, `relatedKnowledge` in `/mini-app/recommend` response) + cross-branch collateral estimates page |
| `b81fb1b` | Claude | feat(admin): branches + articles dry-run import + shared `<ImportPreviewDialog>` + 25 mini-app schema validation tests |
| `7406685` | Claude | feat(admin): users dry-run import + admin frontend test infra (vitest config + 5 `partitionRowActions` tests) |
| `5c51b3c` | Claude | test(admin): lib helper coverage for `time` (8 cases) + `localize` (6 cases) |

Total **15 forward-progress commits** across the period documented (plus several earlier commits during the original audit/cleanup phase).

---

## 2. Scope by area

### 2.1 Database (`lib/db/`)

#### New schemas
- **`schema/collateral.ts`** — 4 tables:
  - `collateral_types` (id, code, nameRu, nameUz, nameEn, isActive, sortOrder, timestamps) — admin-managed reference list
  - `collateral_items` (clientId FK + cascade, collateralTypeId FK, marketValue/acceptedValue numeric(18,2), discountApplied numeric(5,4) nullable, isThirdParty bool, thirdPartyOwnerName, metadata jsonb, isActive, createdBy/updatedBy)
  - `collateral_estimates` (clientId FK + cascade, creditProductId FK, requestedLoanAmount, totalMarketValue, totalAcceptedValue, coverageRatioApplied snapshotted, requiredCollateralValue, coveragePercent, maxLoanAmount, annualRateApplied numeric(6,3) + annualRateAppliedRaw text fallback, resultStatus enum, hasEquipmentOnly, disclaimer, notes, createdBy)
  - `collateral_estimate_items` (estimateId FK + cascade, collateralItemId FK, marketValueSnapshot/acceptedValueSnapshot/discountAppliedSnapshot, unique index on (estimateId, collateralItemId))
- **`schema/system-settings.ts`** — generic key-value config table with `systemSettingKeys` const exporting the 3 collateral keys
- **`schema/recommendation-documents.ts`** — knowledge base table for non-technical staff to author markdown docs (title, body, csv-of-tags, isActive, sortOrder, authorId)

#### Schema edits
- **`schema/activity.ts`** — added `metadata jsonb` column for structured event payloads (before/after, IDs, counts)
- **`schema/index.ts`** — re-exports the three new schemas

#### Migrations
- **`drizzle/0002_collateral_and_settings.sql`** — generated migration: 5 new tables (4 collateral + system_settings), 1 ALTER (`activity_log.metadata`), 9 FK constraints, 6 indexes including the unique on estimate_items
- **`drizzle/0003_recommendation_documents.sql`** — KB table + 2 indexes (`active_idx` and `sort_idx`)
- **`drizzle/meta/_journal.json`** — descriptive tag names instead of orval defaults

#### Operational scaffolding
- **`lib/db/src/migrate.ts`** already existed
- **`lib/db/src/verify-collateral.ts`** added as a runbook helper (idempotent insert + print state) — used during the prod baseline procedure when the Railway Data UI was misbehaving

### 2.2 API package (`lib/api-zod/`, `lib/api-spec/`)

- **`api-spec/openapi.yaml`** — added `collateral` tag, 11 paths (types CRUD, settings GET/PUT, items CRUD, estimates CRUD), 4 entity schemas (`CollateralType`, `CollateralItem`, `CollateralEstimate`, `CollateralSettings`)
- **`api-zod/src/generated/api.ts`** — regenerated via `pnpm --filter @workspace/api-spec run codegen` after the OpenAPI changes
- **`api-zod/src/index.ts`** — re-exports updated; the hand-written `collateral.ts` was deleted because orval generated equivalent zod schemas with the same names. Cross-field validation (`thirdPartyOwnerName` required when `isThirdParty=true`) was moved inline into route handlers.

### 2.3 API server (`artifacts/api-server/src/`)

#### New libs
- **`lib/signedUrl.ts`** — HMAC-SHA256 sign + verify with timing-safe comparison, 5-min default TTL, 1h max clamp via `MAX_TTL_SEC`
- **`lib/collateral-calc.ts`** — pure helpers: `calculateAcceptedValue`, `calculateEstimateTotals`, `isEquipmentOnly`, `extractAnnualRate`, money rounders. No DB, no IO.
- **`lib/system-settings.ts`** — typed accessors over the key-value table with sensible defaults (1.25 / 7 / 0.4) so a missing settings row doesn't break the calculator
- **`lib/knowledge-match.ts`** — exact-tag, case-insensitive matcher of KB docs against keyword set (profile + product segments). Returns up to N matches sorted by `sortOrder`.

#### Lib edits
- **`lib/client-access.ts`** — extended with `requireCollateralItemAccess` and `requireCollateralEstimateAccess` via the existing `makeParamGuard` factory

#### Middleware
- **`middleware/auth.ts`** — removed query-token (`?token=`) fallback (security hardening); added `requireAuthOrSignedUrl` that accepts either a valid bearer or signed URL params on `GET /storage/file`
- **`middleware/activity.ts`** — `logActivity()` now takes optional `metadata: Record<string, unknown>` that lands in the new jsonb column

#### Routes — new files
- **`routes/collateral.ts`** (~670 lines) — 11 endpoints + cross-branch admin estimates query. Highlights:
  - `POST /collateral/signed-url` (auth) — issues HMAC URL, with `verifyClientAccess` IDOR check
  - `POST /clients/:id/collateral-items` — calls `calculateAcceptedValue` server-side; client provides `marketValue` only
  - `POST /clients/:id/collateral-estimates` — DB transaction wrapping parent + child inserts; ID dedup; currency validation; `extractAnnualRate` from product's `rateUZS`
  - `GET /admin/collateral-estimates` — paginated cross-branch view with 4-table join (estimates + clients + branches + creditProducts + users)
- **`routes/recommendation-documents.ts`** — 5 routes (public list of active, admin list-all, create, patch, archive)

#### Routes — edits
- **`routes/clients.ts`** — `?dryRun=1` flag; per-row results; structured activity_log metadata on commit
- **`routes/branches.ts`** — same dry-run pattern
- **`routes/articles.ts`** — same dry-run pattern
- **`routes/users.ts`** — same dry-run pattern; **deferred** password hashing/generation to commit path (dry-run never costs bcrypt); file-internal duplicate detection via `seenInFile` Set; extracted `resolveBranchInput` helper for case-insensitive exact-then-substring branch name matching
- **`routes/mini-app.ts`** — `relatedKnowledge` returned from `/recommend` via `matchKnowledgeDocs`; `buildPdfPayload` fetches latest collateral estimate + item snapshots and includes them; route hardening done by Codex (Zod schemas + access guards)
- **`routes/dashboard.ts`** — added `GET /admin/activity-log` (paginated + filtered by type/user/branch/entityType/date range) + `GET /admin/activity-log/types` (distinct values for the filter dropdown)
- **`routes/storage.ts`** — replaced query-token auth flow with signed-URL flow; per-user IDOR check on issuance; opaque 404s on access-denied to avoid path enumeration; dead Replit-sidecar GCS branch removed
- **`routes/index.ts`** — mounts new collateral and recommendation-documents routers

#### Tests (`__tests__/`)
- **`signedUrl.test.ts`** (8) — sign/verify, expiry, tamper, format, clamp
- **`collateral-calc.test.ts`** (28) — every spec example + edge cases (empty items list, unbounded TTL, float-precision-safe equality)
- **`system-settings.test.ts`** (4) — `readNumber` fallback for non-numeric/null/Infinity/NaN
- **`knowledge-match.test.ts`** (9) — case-insensitive, exact-tag-not-substring, inactive-doc skip, limit, empty keyword set
- **`mini-app-schemas.test.ts`** (25) — body validation across the 11 mini-app routes Codex hardened — catches malformed payloads before route logic runs
- **`client-access.test.ts`** — pre-existing; covers role matrix + `makeParamGuard` middleware

#### PDF generator
- **`pdf/generate.ts`** — `PdfData.collateralEstimate?` field added; new `drawCollateralSection` rendered between schedules and footer with RU + UZ copy strings (`getPdfCopy`)

#### Boot/seed
- **`seed.ts`** — added `seedCollateralReferenceData()` (5 types + 3 settings) using `ON CONFLICT DO NOTHING`. **Important:** initially placed inside `seedDatabase()` which is gated by `SEED_DATABASE_ON_BOOT=false` in production, so prod tables stayed empty after the first deploy. Fixed in commit `a0a7e0f` by moving the call to `index.ts` where it runs unconditionally on every boot.
- **`index.ts`** — `SIGNED_URL_SECRET` fail-fast in production; `MINI_APP_URL` validated before `app.listen`; `seedCollateralReferenceData()` called unconditionally (separate from demo-data seed)

#### Config
- **`Dockerfile`** — removed Python venv build step, removed `python3-pip`/`python3-venv`, removed OpenCV system deps (`libglib2.0-0`, `libgl1`), removed `requirements.txt` copy, kept `tesseract-ocr`/`tesseract-ocr-rus`/`python3` for the OCR script. **Image size dropped substantially.**
- **`.env.example`** — `SIGNED_URL_SECRET` documented; `OCR_ENGINE`/`PUBLIC_OBJECT_SEARCH_PATHS`/`PRIVATE_OBJECT_DIR` removed; `SEED_DATABASE_ON_BOOT` comment clarified (collateral seeds always run regardless)
- **`railway.toml`** — healthcheck timeout 300 → 60s

### 2.4 Admin frontend (`artifacts/admin/src/`)

#### New pages
- **`pages/collateral.tsx`** — settings editor (3 numeric inputs) + types manager table + cross-branch estimates section with status filter and pagination
- **`pages/recommendations.tsx`** — KB authoring (list + create/edit dialog with markdown textarea + archive flow)
- **`pages/activity-log.tsx`** — paginated audit table; filters for event type / from / to; clickable rows expand a `<pre>`-rendered JSON metadata block beneath the row

#### Page edits
- **`pages/client-detail.tsx`** — `<CollateralEstimatesCard>` for client-scoped estimates list; **edit-client dialog** added with full-name/phone/gender/clientType/clientSegment fields gated to manage-roles; new `Pencil` button on the details card header
- **`pages/clients.tsx`** — `handleImport` rewritten to open the dry-run preview Dialog (instead of one-shot upload); KPI cards (Total/Will Import/Will Skip) + per-row OK/error badges
- **`pages/branches.tsx`**, **`pages/articles.tsx`** — replaced direct upload with `<ImportPreviewDialog>` + columns config
- **`pages/sap-codes.tsx`**, **`pages/users.tsx`**, **`pages/credit-products.tsx`**, **`pages/credit-lines.tsx`**, **`pages/articles.tsx`** — inline edit/delete buttons replaced with `<RowActions>` overflow menu
- **`pages/dashboard.tsx`** (Codex) — corrected filter param names + summary respects the same filters

#### New components
- **`components/row-actions.tsx`** — `<RowActions>` overflow menu (`MoreHorizontal` trigger + dropdown with safe/dangerous groups separated). Exports a pure `partitionRowActions(actions)` helper that's unit-tested.
- **`components/import-preview-dialog.tsx`** — reusable `<ImportPreviewDialog>` that takes endpoint + columns config + onCommitted callback. Handles the dry-run-then-commit lifecycle, KPI cards, scrollable preview table, confirm with count.

#### Sidebar
- **`components/layout.tsx`** — 3 new sidebar entries (admin-roles only): Залог / Garov, Рекомендации / Tavsiyalar, Журнал активности / Faoliyat jurnali. New icon imports: `Coins`, `Activity`, `BookOpen`.

#### App routing
- **`App.tsx`** — 3 new lazy-loaded admin-only routes: `/collateral`, `/recommendations`, `/activity`

#### Tests (NEW infra)
- **`vitest.config.ts`** — first-time admin test setup, mirrors mini-app's
- **`__tests__/row-actions.test.ts`** (5) — `partitionRowActions` correctness on empty/safe/danger/hidden combinations + order preservation
- **`__tests__/time.test.ts`** (8) — `formatAdminFileDate`/`FileDateTime`/`ShortDate`/`LongDate` in Asia/Tashkent; UTC late-evening rollover; nullish input handling
- **`__tests__/localize.test.ts`** (6) — pass-through for non-uz langs; nullish → ""; months localizer fallback for unknown keys

#### i18n
- **`i18n/ru.json`**, **`i18n/uz.json`** — keys added for `collateralAdmin.*` (incl. estimates section), `recommendations.*`, `activityLog.*`, `clientsImport.*`, `clientDetail.editTitle`/`clientType`/`clientSegment`/`gender`, `common.active`

### 2.5 Mini-app frontend (`artifacts/mini-app/src/`)

> Most edits in this area are Codex's. Claude additions are noted explicitly.

#### New pages (Claude)
- **`pages/collateral.tsx`** — multi-step state machine (list → add → estimate → result + saved estimates panel); `<SignedDocImage>` extracted to `client-detail.tsx`

#### Page edits (Codex)
- **`pages/client-detail.tsx`** — prominent green collateral CTA card; business location persists to client row; gender display when set; `<SignedDocImage>` (Claude originally added)
- **`pages/clients.tsx`** — gender filter (Codex)
- **`pages/questionnaire.tsx`** — deterministic-first follow-up questions (no blocking AI wait) (Codex)

#### Lib (Claude)
- **`lib/api.ts`** — `getAuthImageUrl` removed; `getSignedImageUrl` async function calls `POST /storage/signed-url` and returns the signed URL with HMAC params

#### Tests (Claude)
- **`vitest.config.ts`** — first-time mini-app test setup
- **`__tests__/api.test.ts`** (4) — signed URL contract, no `?token=` in returned URL, Bearer attachment

#### App routing
- **`App.tsx`** — added `/clients/:id/collateral` route

### 2.6 Root config

- **`eslint.config.js`** (NEW) — flat config, `@eslint/js` recommended + `typescript-eslint` recommended + `react-hooks` rules. Tuned to surface real bugs without flooding (caught-error pattern accepts `err` per codebase convention).
- **`.nvmrc`** (NEW) — Node 22
- **`package.json`** — `engines.node ">=22"`, root `test` + `lint` + `lint:fix` scripts; Win64 binaries (`@rollup/rollup-win32-x64-msvc`, `@tailwindcss/oxide-win32-x64-msvc`, `lightningcss-win32-x64-msvc`) moved to `optionalDependencies`
- **`pnpm-workspace.yaml`** — removed `@replit/*` catalog entries + `minimumReleaseAgeExclude`
- **`.github/workflows/ci.yml`** — runs lint + typecheck + test + audit; Node version sourced from `.nvmrc`

### 2.7 Docs

- **`docs/migrations.md`** — production baseline procedure (insert into `__drizzle_migrations` for migrations 0000+0001 since prod was originally built via `db:push`)
- **`docs/railway-deployment.md`** — `SIGNED_URL_SECRET` documented as required in production; dead GCS env vars removed; migrate-based deploy path added
- **`docs/secret-rotation-and-incident-response.md`** — `SIGNED_URL_SECRET` added to inventory
- **`docs/collateral-feature-audit.md`** — written for the prior Codex audit pass on the collateral feature
- **`docs/session-audit.md`** — this document
- **`WORKSPACE.md`** — renamed from `replit.md`; updated with Node 22 / Railway / migrations facts

### 2.8 Deletions

- `.replit`, `replit.nix`, `pyproject.toml`, `uv.lock`, `main.py` — Replit residue
- `artifacts/admin/.replit-artifact/`, `artifacts/mini-app/.replit-artifact/` — empty Replit marker dirs
- `artifacts/api-server/requirements.txt` — Python deps for PaddleOCR, no longer needed
- `artifacts/api-server/src/lib/objectStorage.ts` — Replit GCS sidecar (calls `127.0.0.1:1106`, dead on Railway)
- `lib/api-zod/src/collateral.ts` — superseded by orval-generated equivalents
- Outer `D:\Minerva\.git` — bundled to `D:\credit-hunter.bundle` then removed

---

## 3. Test coverage detail

| Package | Before | After | Files | Tests |
|---|---|---|---|---|
| `@workspace/api-server` | 89 | **164** | 15 | signed URL (8), collateral-calc (28), system-settings (4), knowledge-match (9), mini-app-schemas (25), pre-existing (calculator, client-access, session-store, telegram, telegram-webhook, spreadsheet-import, auth, desired-amount, questionnaire-clear-basket = 90) |
| `@workspace/admin` | 0 | **17** | 3 | row-actions (5), time (8), localize (6) |
| `@workspace/mini-app` | 4 | 4 | 1 | api.ts smoke tests |
| **Total** | **89** | **185** | **19** | |

Lint: 65 → 18 warnings. The remaining 18 are all in pre-existing files I haven't touched; clearing them risks breaking unrelated functionality.

---

## 4. Operator queue (your side)

Order matters for items 1–3.

| # | Item | Why it's blocking | Est. time |
|---|---|---|---|
| 1 | Apply migration `0003_recommendation_documents` to prod via `pnpm --filter @workspace/db run migrate` with the **real** `DATABASE_URL` | The new admin KB page returns 500 without it; activity log etc. work because `0002` already shipped | 1 min |
| 2 | Rotate the Postgres password | The original `VGSVaqNIzZkuKDRibHltrrPDOVPtwpwm` leaked into chat earlier this session | 2 min |
| 3 | Optionally rotate `SIGNED_URL_SECRET` again | Same chat-leak situation; one rotation already happened | 2 min |
| 4 | Smoke test post-deploy | Verify sidebar entries, `...` row menus, KB authoring, activity log filters, client edit dialog, client CSV import preview | 10–15 min |
| 5 | Decide credit-line green/red row marking rule | Bank business decision; can't ship without it | TBD |
| 6 | Decide interest-rate selection logic | Bank business rules; free-text `rateUZS` cannot drive selection | TBD |
| 7 | Provide concrete "access process" scenario | Real "I needed X but the system made it hard because Y" — without it I can't design | TBD |

---

## 5. Deliberately not done

| Skipped | Reason |
|---|---|
| Mini-app UI consuming `relatedKnowledge` | Codex's territory while their work is in flight; the API exposes the field for whenever they pick it up |
| Bulk import dry-run for credit-products / sap-codes / credit-lines | Replace-all catalogue refresh semantic; rare ops; marginal value |
| 18 remaining ESLint warnings | All in pre-existing files I didn't touch; risk of unrelated breakage outweighs cleanup |
| Frontend tests for individual admin pages | Diminishing returns; harness exists, easy to extend per-page when there's a regression to lock down |
| AI recommendation phase 2 (RAG + cache + streaming) | Multi-day; foundation laid (KB, matcher, response field) but real impl needs design + iteration |
| Mini-app users/branches/articles import upgrades to backend dry-run | Existing user import has client-side preview that shows generated passwords — refactor risks regression for marginal gain |
| Replacing `objectStorage.ts` callers in storage routes (further) | Dead-code branches were already removed in earlier cleanup; remaining `routes/storage.ts` only serves from `/local-objects/` which is correct |

---

## 6. Audit prompts for Codex

Pass these to a Codex audit session along with this document.

### Code review
1. **`lib/knowledge-match.ts`** — exact-tag-match, case-insensitive, no fuzzy/synonyms. Right call given experts will write tags freely? Should it lowercase-normalize on insert too? Tag delimiter is `,` — should it accept `;` or whitespace too?
2. **`routes/users.ts`** users-import dry-run — `seenInFile` Set tracks file-internal duplicates correctly. If a row is malformed (missing fields) AND has a duplicate telegramId, only the "missing fields" error fires (first check wins). Right ordering?
3. **`routes/dashboard.ts`** is getting big — should `/admin/activity-log` be split into `routes/admin-activity.ts`?
4. **`<ImportPreviewDialog>`** column `render` callback — receives the full row and indexes by key. Type erasure (`row[c.key] as React.ReactNode`) — safe enough?
5. **`partitionRowActions`** — preserves original index order within groups. Right invariant for the UX, or should danger always sort to a stable position?
6. **`/admin/collateral-estimates`** join chain — 4 joins (clients + branches + creditProducts + users). Cheap enough at scale or should it be denormalized?
7. **Migration 0002 + 0003 indexes** — `collateral_items_client_active_idx (client_id, is_active)` is the primary read pattern; `recommendation_documents_active_idx (is_active)` and `_sort_idx (sort_order)` — are both needed or is the matcher's `WHERE is_active=true ORDER BY sort_order ASC` better served by a composite?
8. **Activity log query** has no `(type, created_at)` composite index. Filter performance OK at 100k+ rows? Where's the ceiling?

### Design questions
9. `<ImportPreviewDialog>` does a separate POST for dry-run then commit. Browser parses the file twice. Acceptable or should it cache the parsed result and re-POST raw rows?
10. KB matcher uses CSV-string tags. Migration to `text[]` would be cheap. Worth it now?
11. The collateral `relatedKnowledge` field is shape-typed but not in OpenAPI. Add it to `openapi.yaml` and regenerate?
12. `seedCollateralReferenceData()` and the `__drizzle_migrations` baseline procedure both exist as runbooks. Should they be a single bootstrap script?

### Security re-audit
13. Signed URL flow — IDOR check on `POST /storage/signed-url` (lookup `storagePath` → `verifyClientAccess`) is airtight when multiple clients share the same path? In practice paths include UUIDs so this shouldn't happen, but worth confirming.
14. Activity log `metadata` is unbounded jsonb. Need to redact PII before persisting? Currently writes before/after rows of entire user-edited entity for `collateral_settings_updated`, `collateral_type_updated`, `collateral_item_updated`.
15. Admin pages all gate via `requireRole`. Any route that should be branch-scoped (head_office_admin sees all branches, but other roles shouldn't) where I missed the branch filter?

---

## 7. Numbers

- Files added: ~24
- Files edited: ~49
- Files deleted: ~13
- Lines net: roughly +5,800 / −3,200
- Forward-progress commits documented here: 15
- Tests: 89 → 185 (api-server 164, admin 17, mini-app 4)
- Migrations: `0001` → `0003` (`0002_collateral_and_settings`, `0003_recommendation_documents`)
- New admin sidebar entries: 3
- New mini-app routes: 1 (`/clients/:id/collateral`)
- New API routes: 19 (11 collateral + 5 KB + 2 admin activity + 1 cross-branch estimates)

---

## 8. Resume notes for the next Claude session

If you're a fresh Claude reading this:

1. The work in this document is committed and pushed to `main`. `git log --oneline -20` shows the arc.
2. Migration `0003` may or may not be applied to prod — check operator queue item #1 above and ask the user before assuming either state.
3. Codex (parallel agent) handles mini-app. Don't touch `artifacts/mini-app/src/pages/*` unless asked — coordinate first.
4. The user prefers terse responses, ships fast, and authorizes commits explicitly. Don't push without asking.
5. The `<ImportPreviewDialog>` and `<RowActions>` are the two reusable admin components — extend them rather than adding new ones.
6. Activity log + KB are the foundation for future AI work (RAG over docs). The `matchKnowledgeDocs` helper is the seam.
7. Open questions for the bank/user are listed in section 4 above. Don't try to design around them — surface them.

---

*Last updated this session.*
