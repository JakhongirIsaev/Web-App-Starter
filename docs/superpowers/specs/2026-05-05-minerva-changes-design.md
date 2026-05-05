# Minerva — Pre-Launch Changes Design

**Date:** 2026-05-05
**Repo:** `D:\Minerva\web-app-starter` (https://github.com/JakhongirIsaev/Web-App-Starter)
**Branch base:** `main` (production-deploy branch). This spec is committed on `claude/spec-changes-2026-05-05`.
**Status:** Approved by user; design phase. Implementation plan to follow in a separate document.

---

## 1. Context

Minerva is the SME-banking Telegram Mini App + admin panel for IPAK YO'LI Bank, used by **credit experts** to capture leads in markets, mahallas, and shops, run them through eligibility/pre-screening, recommend products, and produce a leave-behind PDF for the prospective client.

The system is **pre-launch**. No real users on production yet. The user is preparing a batch of changes covering bug fixes, AI removal, an EspoCRM revenue-critical integration, admin-configurable credit policy parameters, and field-marketing power-ups, before onboarding the first real users and migrating off Railway to a self-hosted VPS.

This design spec covers all eight items the user raised, sequenced into four phases (A–D).

---

## 2. Decisions Locked In

| # | Decision | Rationale |
|---|---|---|
| Storage | **Cloudflare R2** | Free 10 GB, zero egress fee, S3-compatible (portable to VPS), files persist even if free tier exceeded |
| AI | **Remove all surfaces** | Ollama-on-laptop is unreliable; replace each AI feature with rule/static equivalents |
| Questionnaire | **Replaced by fixed form** | Predictable, audit-friendly, matches rule-based credit policy |
| Espo direction | **Outbound only, real-time, parallel write on every saved lead** | Bank pays credit experts per lead in Espo → revenue-critical |
| Espo creds | **Stub interface for now**; user has admin access to Espo platform, will pull API creds when ready | Unblocks all of Phase A; flip env var to enable real writes |
| QR code on PDF | **Skip for v1**; use plain Telegram URL line instead | User unsure of value; easy to add later |
| Branch model | **Continue on `main`** with per-feature branches | `main` already has 37 commits ahead of `v2`; `v2` is stale; production deploys from `main` |
| Job queue | **Postgres-backed** (`graphile-worker`) — no Redis | Keeps VPS migration simple |
| Future ML retrieval (ColVec1 etc.) | **Not in scope** | Contradicts AI-removal; no current retrieval problem; revisit at end of Phase D |

---

## 3. Current State on `main` (already done — not re-doing)

Confirmed in code as of `cf5af65`:

- **Gender field** (`["male","female"]`) — DB enum, schema column, API routes, generated zod types, RU/UZ i18n labels, both apps. Nothing more to do for the data model side; remaining work is just the **badge/icon visualization** in client lists and detail headers.
- **GPS coordinates** — `latitude`, `longitude` numeric columns on `clients` exist. UI capture (drop-pin, "use my location") and display still need to be built.
- **Rejection reason** — `rejection_reason` column exists.
- **Knowledge base** — admin-authored articles feature exists.
- **Admin user management** — users CRUD + dry-run import already shipped.
- **Collateral overhaul** — admin "Collateral Settings" page exists at `/admin/collateral` with three editable parameters (`coverageRatio`, `transportAgeThreshold`, `transportAgeDiscount`). The `system_settings` JSONB table is the right primitive to extend.
- **Live what-if collateral calculator** + **AI status visible to dashboard** — exists.
- **OCR fallback** (Tesseract) for document scanning — production-ready as of `b433068`.
- **Document scanning storage** — production-ready (`af3f055`), but local-FS path on Railway = files vanish on redeploy. This is the "pictures not saving" bug.
- **`client_documents` table** already exists in schema (`lib/db/src/schema/mini-app.ts`) with: `id, client_id, user_id, doc_type, file_name, storage_path, ocr_text, extracted_data`. Photos and scanned docs share this table — no new `client_photos` table needed; use `doc_type` to discriminate.
- **`client_next_actions` table** already exists with `client_id, user_id, action_type, action_date, priority, description, is_completed`. Phase C6 reminder uses this directly — no new schema.
- **`questionnaire_sessions` and `questionnaire_answers` tables** exist. Phase B3 (questionnaire removal) drops or archives these.
- **`baskets`, `basket_items`, `calculations`** tables exist; PDF generator and recommendation flow already read from them.
- **`clients.id`** is a `serial` (integer) primary key — there is no UUID column today. For Espo idempotency we add a new `external_uuid` column (Section 8.4).

Everything below in Phases A–D builds on this baseline.

---

## 4. Phase A — Stabilize + Espo + Photo Fix

**Duration:** ~2 weeks. **Branch:** features off `main`, PR back to `main`. Tag a release before merge for rollback.

### A1. PDF leave-behind redesign

**Goal:** Generate a 1-page PDF on button-press, fast, suitable for the credit expert to WhatsApp/print/Telegram-send to a prospective client.

**Content (final):**
1. Bank logo + "IPAK YO'LI Bank" header, with branch identifier
2. Client name + business name (filled from form)
3. Indicative loan amount range (min–max, in UZS) and indicative monthly payment range. **Source:** in Phase A this is derived from the existing `calculations` table (the latest calculation for the client's basket — pick min and max). In Phase B this becomes the rule-engine output. Display ranges, NOT a full amortization schedule, NOT individual product details.
4. One-line "What you could finance with this": e.g., "Working capital, equipment, or business expansion."
5. **Credit expert block (prominent):** name, phone, "Have questions? Call me directly." Phone should be a `tel:` link in the PDF metadata.
6. Telegram URL line: "Continue your application → t.me/IpakYoliBot" (plain text, no QR).
7. Footer: small disclaimer ("Indicative only. Final terms subject to credit committee approval. License #X.").

**Implementation:**
- File: `artifacts/api-server/src/pdf/generate.ts` — replace existing multi-section generator with a single-page `generateLeaveBehindPdf(client, expert, indicative)` function.
- **Bundle font in repo:** `artifacts/api-server/fonts/DejaVuSans.ttf` and `DejaVuSans-Bold.ttf`. Force-load these instead of OS font search. Fixes Cyrillic/Uzbek-Latin rendering on Railway Alpine.
- Endpoint: keep `POST /mini-app/pdf` (existing); refactor handler.
- Response time target: **<2 seconds end-to-end** at p95. Keep no LLM in this path (already removed in `bfaa337`).
- Per-language: PDF generated in client's language. For Phase A, default Russian; Phase D adds full bilingual.

**Acceptance:**
- Generated PDF opens without font errors on macOS, Windows, Android, iOS.
- Cyrillic characters render correctly.
- File size < 200 KB.
- Generation latency p95 < 2s on Railway.
- Visual review: matches the content list above.

### A2. Storage migration to Cloudflare R2

**Goal:** Stop losing photos and scanned documents on Railway redeploy. Display saved files in both apps.

**Implementation:**
- Add R2 bucket `minerva-prod-uploads` (and `minerva-staging-uploads` for `v2-preview` env, even though we deploy to `main`-driven `production` — keep the staging bucket for safety).
- Use `@aws-sdk/client-s3` with R2 endpoint (S3-compatible).
- Env vars (set in Railway service settings):
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET`, `R2_PUBLIC_BASE_URL` (for serving via Cloudflare public bucket or signed URLs)
- File: replace `artifacts/api-server/src/routes/storage.ts` upload handler logic. Keep the same endpoint shape (`POST /storage/upload-image`, `POST /storage/upload-document`) so callers don't change.
- DB schema: **reuse existing `client_documents` table** (in `lib/db/src/schema/mini-app.ts`). Add columns where missing:
  ```
  client_documents (existing): id, client_id, user_id, doc_type, file_name, storage_path, ocr_text, extracted_data, created_at
  add: mime_type text, size_bytes integer, deleted_at timestamp
  ```
- Extend `doc_type` values used by code (no DB enum — column is `text`): `photo_storefront`, `photo_owner`, `cadastre`, `vehicle_passport`, `business_license`, `financial_statement`, `voice_note`, `consent_signature`, `other`. Document the canonical list in `lib/db/src/schema/mini-app.ts`.
- `storage_path` becomes the R2 object key (e.g. `clients/{clientId}/{uuid}.{ext}`).
- Storage URL strategy: **public bucket with random opaque keys** (UUID-based, no PII in path). For sensitive docs (cadastre etc.) use **signed URLs** with 15-minute TTL.
- Migration script: enumerate any existing local-FS uploads and re-upload to R2; record new storage keys.

**Display surfaces (both apps):**
- **Mini-app `client-detail.tsx`:** photo grid (5 col on mobile, lazy-load) + scanned-docs list with thumbnail + filename + download button.
- **Admin `client-detail.tsx`:** same gallery + docs list, with delete capability for `editor`+ roles.
- **Mini-app new-client / scan-document flows:** show upload progress, success/fail state, render thumbnail immediately on success.

**Acceptance:**
- Upload a photo, redeploy api-server, photo still loads on both apps.
- Scanned document upload + OCR text extraction round-trips intact.
- 12 MB upload succeeds; 13 MB upload returns 413 with clear error.
- Public URLs cache for 1h; signed URLs expire correctly.

### A3. Espo outbound sync (lead → Espo, real-time)

**Goal:** Every newly saved lead writes to Espo within seconds. If Espo is down, retry. Never block the user save on Espo.

**Architecture:**

```
[Mini-app save] -> POST /mini-app/clients
    -> INSERT into clients
    -> INSERT into espo_sync_jobs (idempotency_key=client_uuid)
    -> Return 200 to user
[Worker] -> graphile-worker polls espo_sync_jobs
    -> POST to Espo /api/v1/Lead with payload
    -> On success: UPDATE clients SET espo_lead_id=..., espo_synced_at=NOW()
    -> On failure: increment retry_count, exponential backoff, max 10 retries
    -> After max retries: mark job as failed, surface in admin panel
```

**Why this shape:** revenue-critical (bank pays per Espo lead) means we need at-least-once semantics with idempotency. We cannot afford lost leads (revenue loss) or duplicate leads (bank-side dispute).

**Idempotency:**
- `idempotency_key = client.uuid` sent as `X-Idempotency-Key` header to Espo. If Espo doesn't honor this, we fall back to a `local_lead_uuid` custom field on the Espo Lead entity to detect duplicates.
- If retry succeeds and finds an existing Espo lead with the same key, we adopt that ID instead of creating new.

**Files:**
- New: `artifacts/api-server/src/integrations/espo/client.ts` — typed API client. Initially a stub (`mockEspoClient`) returning fake IDs; behind env flag `ESPO_INTEGRATION=stub|live`.
- New: `artifacts/api-server/src/integrations/espo/types.ts` — request/response types.
- New: `artifacts/api-server/src/integrations/espo/payload.ts` — `clientToEspoLead(client)` mapping function. Pure, unit-testable.
- New: `artifacts/api-server/src/jobs/espo-sync.ts` — graphile-worker task.
- New: `artifacts/api-server/src/jobs/index.ts` — worker bootstrap (separate process, share DB, not the api-server process).
- Schema: `lib/db/src/schema/espo-sync-jobs.ts` (new).
- Schema: extend `clients` with `external_uuid uuid` (default `gen_random_uuid()`, unique, indexed — used as Espo idempotency key), `espo_lead_id text`, `espo_synced_at timestamp`, `espo_last_error text`.

**Worker deployment:** Add a new Railway service `@workspace/worker` running `node dist/jobs/index.js`. Same image as api-server, different start command. Shares Postgres.

**Admin "Espo sync errors" panel:**
- New page: `artifacts/admin/src/pages/espo-sync.tsx`.
- Shows: failed jobs (retry exhausted), pending jobs > 5 min old, recent successes.
- Manual "retry now" button per job.
- Endpoint: `GET /admin/espo-sync/jobs?status=failed|pending`.

**Acceptance:**
- Save lead with Espo stub mode → response < 500ms, lead row inserted, job queued, worker logs "stub success".
- Flip to `ESPO_INTEGRATION=live` with real creds → real Espo lead appears, `espo_lead_id` populated within 30s.
- Kill Espo (block its URL) → user save still succeeds, jobs accumulate in queue, retry succeeds when restored.
- Re-save same client → no duplicate Espo lead.
- Failed job after 10 retries → visible in admin panel.

### A4. RBAC capability matrix

**Goal:** Replace ad-hoc role-name string checks with a Permission enum and a role→permissions map. Audit and close gaps.

**Implementation:**

- New: `lib/api-spec/permissions.ts` (or shared lib):
  ```ts
  export type Permission =
    | "client.read.own"
    | "client.read.branch"
    | "client.read.all"
    | "client.create"
    | "client.update"
    | "client.delete"
    | "collateral.read"
    | "collateral.update"
    | "policy_params.read"
    | "policy_params.update"
    | "user.manage"
    | "espo.view_sync"
    | "espo.retry_sync"
    | "knowledge.author"
    | "report.view_branch"
    | "report.view_all"
    // ...
  ```
- New: `lib/api-spec/role-permissions.ts`:
  ```ts
  export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    superadmin: [/* all */],
    head_office_admin: [...],
    branch_head: [...],
    editor: [...],
    hunter: [...],
  };
  ```
- Refactor: `artifacts/api-server/src/middleware/auth.ts` — add `requirePermission("client.update")` middleware. Keep `requireAuth` and `guestAuth` as primitives; remove inline role-name checks from route handlers.
- Audit pass: `grep -rn 'role ===\|role==\|user?.role' artifacts/` and replace each with `requirePermission(...)`.

**Output deliverables:**
- `docs/roles-and-permissions.md` — generated/maintained capability matrix table.
- A list of pre-existing under-restriction bugs (e.g., editor able to update collateral params) → filed as separate issues in the implementation plan.

**Acceptance:**
- Every protected route uses `requirePermission`. No inline `role === 'X'` outside the permissions map.
- Roles doc table renders matrix: rows = features, cols = roles, cells = ✓/✗.
- Audit issues documented; severity-sorted.

### A5. Phase A out-of-scope (do not touch)

- Do not change credit-policy parameters page yet (Phase B).
- Do not remove AI yet (Phase B).
- Do not redesign buttons (Phase C).
- Do not add lead source / GPS UI (Phase C).

---

## 5. Phase B — De-AI + Restructure

**Duration:** ~2–3 weeks. **Branch:** features off `main`. **Soak:** deploy each PR to a Railway PR preview environment (Railway auto-creates one per branch on push); run smoke tests there before merging to `main`. (Note: the existing `v2-preview` env on Railway is currently misconfigured — separate cleanup task to either delete it or repurpose it for `main`-tracking staging.)

### B1. Replace AI surfaces with deterministic equivalents

| AI surface today | Replacement | File(s) to change |
|---|---|---|
| Questionnaire follow-ups (`POST /ai/generate-questionnaire`) | DELETED — questionnaire is replaced (B3) | `routes/ai.ts`, `mini-app/pages/questionnaire.tsx` |
| Product recommendations (`POST /ai/recommend-products`) | **Rule engine** matching client segment + purpose + amount → eligible product list, sorted by terms. Source = credit policy parameters (B2). | `routes/ai.ts` → `routes/recommend.ts`; new `lib/recommend-engine.ts` |
| Offer summary (`POST /ai/generate-offer-summary`) | **Static template** with token replacement | `routes/ai.ts`, `pdf/generate.ts` |
| Auto/vehicle data extraction (`POST /ai/extract-auto`) | **Manual entry** (form fields) — keep OCR for text-only docs via Tesseract | Mini-app collateral edit page |
| Translation (`POST /ai/translate`) | **Static i18n bundles** RU/UZ JSON | `mini-app/i18n/*.json`, `admin/i18n/*.json` (already exist) — close the AI translate endpoint |
| OCR fallback | **Already on Tesseract** (no change) | n/a |

### B2. Admin "Credit Policy Parameters" page

**Goal:** Make every numeric/list parameter from the credit policy doc admin-editable, versioned, and consumed by the rule engine.

**Parameter set (initial):**
```
{
  "version": "2026.05",
  "effective_from": "2026-05-15",
  "effective_to": null,

  "min_coverage_ratio": 1.25,

  "collateral_discounts": {
    "government_securities": 1.00,
    "real_estate":           0.90,
    "vehicles":              0.80,
    "corporate_securities":  0.80,
    "inventory_circulation": 0.80,
    "equipment":             0.70
  },

  "transport_age_threshold_years": 7,
  "transport_age_discount":        0.40,

  "dscr_max":     0.80,
  "dscr_max_fx":  0.50,
  "debt_to_equity_max": 1.00,
  "loan_to_working_capital_max": 0.70,

  "min_rates_uzs": {
    "micro":  { "le_12m": 0.24, "gt_12m": 0.26 },
    "small":  { "le_12m": 0.24, "gt_12m": 0.25 },
    "medium": { "any":    0.24 }
  },
  "min_rates_fx": {
    "micro":  0.14,
    "small":  0.13,
    "medium": 0.12
  },

  "max_term_months": {
    "working_capital": 36,
    "fixed_assets":    60
  },

  "negative_industry_keywords": [
    "tobacco","weapons","gambling","casino","alcoholic_strong",
    "fur","endangered","currency_speculation","securities_invest"
  ],

  "graduated_lending": {
    "loan_1_max_months":       6,
    "loan_1_max_months_trade": 3,
    "loan_2_max_months":       9,
    "loan_3_max_months":       12
  },

  "credit_committee_limits_usd": {
    "single_borrower":  1000000.01,
    "related_group":    5000000.01
  }
}
```

**Implementation:**
- Schema: extend `system_settings` table to support **versioned blobs**:
  ```
  system_settings_versions: id, key, version, effective_from, effective_to (nullable), value (jsonb), created_by, created_at
  ```
- Service: `artifacts/api-server/src/lib/policy-params.ts` exposes `getActivePolicyParams(asOf?: Date): PolicyParams`.
- Page: `artifacts/admin/src/pages/credit-policy.tsx` — sectioned form (Coverage, Discounts, Ratios, Rates, Terms, Industries, Lending Graduation, Committee Limits). Save = create new version, set `effective_from`, optionally pre-date.
- All readers (rule engine, collateral calc) call `getActivePolicyParams()`.
- Migration: seed first version from current hardcoded values.

**Acceptance:**
- Admin can change a parameter, save, see the new version listed.
- Rule engine uses new values immediately for new applications, old values for historical ones (per `created_at` of application vs version `effective_from`).
- Audit log entry on every save (who, when, what changed).

### B3. Remove questionnaire, replace with fixed form

**Goal:** Delete the multi-step questionnaire. Replace with a single client form that captures everything we need, no AI.

**Form sections (in order):**
1. **Identity** — name, gender (already exists, just expose), phone, business name, business type
2. **Lead source** — new field `lead_source` enum: `direct_visit`, `referral_existing_client`, `mass_media_tv`, `mass_media_radio`, `mass_media_print`, `mahalla_booklet`, `walk_in`, `other`
3. **Referrer** — `referrer_client_id` (nullable, FK to clients, lookup) when source = referral
4. **Location** — branch (auto from user), GPS pin (drop-pin or "use my location" — Phase C ships the UI; Phase B saves the columns)
5. **Loan intent** — purpose (enum from policy `allowed_purposes`), desired amount UZS, term months
6. **Eligibility self-check** — citizenship (UZ?), 6+ months of operation?, predominantly private?, branch service area? (booleans, used by rule engine)

**Implementation:**
- Schema: add `lead_source`, `referrer_client_id`, plus boolean self-check fields to `clients`.
- Delete: `mini-app/src/pages/questionnaire.tsx`.
- Refactor: `mini-app/src/pages/new-client.tsx` to host the new form.
- Refactor: client status state machine. Existing `clientStatusEnum` is `["draft", "questionnaire", "recommendation", "basket", "pdf_generated", "under_review", "approved", "completed", "rejected"]`. New flow drops `"questionnaire"` and adds `"lead"` as the post-form pre-recommendation state. Migration:
  - Add `"lead"` to the enum.
  - Backfill: existing rows with `status='questionnaire'` → set to `'lead'`.
  - Remove `"questionnaire"` from the enum once code stops referencing it.
- Persist transitions on the `clients` row.
- Endpoint: existing `POST /mini-app/clients` extended with new fields.

**Acceptance:**
- Old questionnaire URL `/questionnaire/:clientId` returns 410 Gone or 301 to new-client page.
- Saving a client populates lead_source, referrer (if any), self-check flags.
- Rule engine consumes the form and returns recommendations without an AI call.

### B3a. Drop or archive questionnaire tables

- Tables `questionnaire_sessions` and `questionnaire_answers` exist in `lib/db/src/schema/mini-app.ts`.
- After B3 form ships and runs for 7 days, write a migration that:
  - Renames them to `archived_questionnaire_sessions` / `archived_questionnaire_answers` (data preserved for audit)
  - Drops the FK from clients to either, if any
- Code references removed in B1.

### B4. Decommission Ollama

**Sequence:**
1. After B1–B3 ship and run for 7 days without rollback.
2. Remove `artifacts/ollama-ai/` directory.
3. Remove the Railway `ollama-ai` service.
4. Remove `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS` env vars.
5. Remove `artifacts/api-server/src/ai/` directory.
6. Remove `routes/ai.ts`.
7. Update `lib/api-spec/openapi.yaml` to delete the 5 AI endpoints.
8. Regenerate zod and react hooks.

**Acceptance:**
- `grep -ri 'ollama' artifacts/ lib/` returns nothing.
- API server starts without Ollama env vars.
- Railway monthly bill decreases by the Ollama service's line item.

---

## 6. Phase C — Marketing Power-Ups

**Duration:** ~2 weeks. All items, sequenced one-by-one per user request. **Branch:** features off `main`.

### C1. Rapid lead-capture screen

**Goal:** Credit expert in front of a shop owner has 30 seconds. One screen, save the lead, fill detail later.

- New: `mini-app/src/pages/quick-lead.tsx`.
- Fields visible: name, phone, business type (3-tap chips), GPS pin (auto-detected, single tap to confirm), photo (camera button → preview), voice note (optional, mic button → 30s max, stored as `client_documents` row with `doc_type=voice_note`).
- Save button: persists, fires Espo sync, returns to home with toast "Lead saved → Aziz"-style feedback.
- Reachable from home FAB (floating action button, bottom-right, primary color).
- Existing `new-client` form remains for full data entry (linked from quick-lead's "add more details" link).

### C2. Today's-leads dashboard for credit expert

- New: `mini-app/src/pages/my-day.tsx` (or extend home).
- Sections: today's count, this-week count, last-7-days conversion funnel (lead → application → approved → disbursed).
- Click a section → filtered client list.
- Endpoint: `GET /mini-app/dashboard/me`.

### C3. Funnel report for branch heads

- New: `admin/src/pages/funnel.tsx`.
- Filters: branch, date range, expert, lead source.
- Output: funnel chart (lead → application → approved → disbursed) with counts and conversion %.
- Endpoint: `GET /admin/reports/funnel`.

### C4. "Send PDF to lead via Telegram" action

- Bot command + button on `client-detail` (mini-app and admin): "Send PDF to lead".
- Flow: generate PDF → upload to R2 → call grammy `bot.api.sendDocument(leadTelegramId, fileUrl)` if lead has a Telegram link, else show "Copy WhatsApp link" with `wa.me/<phone>` URL.
- Requires lead phone number (already captured) and optionally Telegram username (new field).

### C5. Button placement redesign (admin)

**Specific items the user flagged:**
- "Add new user" button — currently visible on every admin page header? Move to admin-users page only, or to a global "+ New" overflow.
- Import / Export buttons — move from primary toolbar to an overflow menu (3-dot) on each list page. Keep keyboard shortcut available.

**General principles:**
- Primary action: top-right of page (1 button).
- Secondary actions: overflow menu next to the primary.
- Bulk actions: surface only when rows are selected.
- Mobile (admin viewport <600px): primary becomes a sticky bottom-right FAB.

**Pages to revise:** `admin/src/pages/clients.tsx`, `users.tsx`, `articles.tsx`, `credit-products.tsx`, `collateral.tsx`. Plus mini-app `clients.tsx` and `home.tsx`.

### C6. Reminder / follow-up

- **Reuse existing `client_next_actions` table** — already has `client_id, user_id, action_type, action_date, priority, description, is_completed`. No schema changes needed.
- Mini-app + admin: edit dialog to create/update next-action rows (set `action_date`, `description`, `priority`).
- Worker job: daily at 9am local → query `client_next_actions WHERE action_date <= today AND is_completed = false` → send Telegram message to `user_id` (the assigned credit expert) with the lead and description.

---

## 7. Phase D — Field Hardening

**Duration:** ~1–2 weeks. Polish for first real-user launch.

### D1. Offline mode

- Mini-app: capture saves to IndexedDB queue when offline.
- On reconnect: drain queue → POST each → on success delete from queue. On conflict (duplicate), reconcile on `idempotency_key`.
- UI indicator: "Offline" badge in header. Pending sync count.
- Use service worker (Vite PWA plugin) for app-shell caching.

### D2. Bilingual PDF

- New `clients.preferred_language` field (`ru` | `uz`).
- PDF generator picks the language pack on render.
- I18n strings stored in `lib/db/src/seed/pdf-strings.json` (RU + UZ versions of every label, disclaimer, etc.).

### D3. Signature/consent capture

- New field on new-client: signature pad (HTML5 canvas → PNG base64 → R2 upload as `client_documents` row with `doc_type=consent_signature`).
- Required before save. Legal: bank-required for personal-data consent under UZ regulations.
- Display on admin client-detail (read-only).

### D4. Espo two-way reconcile

- Daily worker job: pull all Espo leads created in last 24h → diff against local `clients.espo_lead_id` set → flag mismatches.
- Admin alert if discrepancy > 0 (so payouts are not under-counted).
- Endpoint: `GET /admin/espo-sync/reconciliation` showing the daily report.

---

## 8. Architecture Decisions

### 8.1 Job queue choice

`graphile-worker` over `pg-boss`:
- Both are pure Postgres
- graphile-worker has better retry/backoff defaults and simpler API
- Survives VPS migration unchanged (just same Postgres)

Worker process is a **separate Railway service** sharing the Postgres URL. This separation prevents long-running jobs from blocking HTTP requests.

### 8.2 Storage backend

- **R2 primary**, public bucket for non-sensitive (storefront photos), signed URLs for sensitive (cadastre, signed consent).
- Migration shim: keep local-FS upload as fallback if R2 env vars missing — useful for local dev only. Production-fail-loud if creds missing.

### 8.3 RBAC enforcement

- Permissions checked at the **route boundary** via middleware, not inside handlers.
- UI gates check the same permission map (single source of truth in `lib/api-spec/role-permissions.ts`, imported by both server and clients via the existing api-zod / api-client-react generation pipeline).

### 8.4 Espo idempotency

- `clients.id` is a `serial` integer (internal). For Espo we mint a fresh UUID per client row in a new `clients.external_uuid uuid` column (default `gen_random_uuid()`).
- Worker reads `external_uuid` and sends it as both:
  - `X-Idempotency-Key` header (in case Espo honors it)
  - `local_lead_uuid` custom field on the Espo Lead entity (always — defends against retries when Espo doesn't honor the header)
- Reconcile job (D4) joins on this UUID.

### 8.5 PDF font strategy

- Bundle `DejaVuSans` (regular + bold) in `artifacts/api-server/fonts/`.
- pdfkit `registerFont` at boot.
- No OS font search.
- Trade-off: +400KB binary. Acceptable for reliability.

---

## 9. Branch + Deploy Strategy

```
main  ───────●────●────●────●─── (production-deploy, Railway production env)
                   ↑    ↑    ↑
                   │    │    └─ phase A1 PR merge
                   │    └────── phase A2 PR merge
                   └─────────── phase A3 PR merge
                          ...

claude/spec-changes-2026-05-05  ── (this spec PR, merge first)
feat/pdf-redesign               ── (A1)
feat/storage-r2                 ── (A2)
feat/espo-sync                  ── (A3)
feat/rbac-matrix                ── (A4)
feat/policy-params              ── (B2)
feat/remove-ai                  ── (B1, B4)
feat/fixed-form                 ── (B3)
... etc.
```

- Tag `v2.x.0` on `main` before each phase's first merge for easy rollback.
- Railway production tracks `main` → auto-deploys.
- Rollback procedure: `git revert <merge-sha>` on `main`, push.
- `v2-preview` env: catch up to main once (one-time merge), then deprecate or re-purpose for staging.

---

## 10. Risks and Rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| Espo API schema changes mid-implementation | Stub mode with hand-typed payload; flip to live only after dry-run | Disable `ESPO_INTEGRATION` env, jobs queue but don't fail |
| R2 outage | Local-FS fallback for dev; on prod, jobs retry, photos surface "uploading…" placeholder | Re-point to GCS env vars temporarily |
| AI removal breaks recommendation flow | Rule engine gated behind feature flag; AI endpoints stay 1 release for canary | Re-enable AI flag |
| Policy param page lets admin set invalid combos | Server-side schema validation (zod) on save; range checks on every field | Versioned table — revert to previous version |
| Espo two-way reconcile exposes payout discrepancy | Surface, don't auto-correct. Investigate manually | n/a |
| Forge mode (deleting questionnaire) breaks deep links | 301 redirects from old URL paths | Keep route stub for 1 release |

---

## 11. Success Criteria (when can we say done?)

**Phase A done:**
- [ ] PDF renders Cyrillic correctly on Railway, p95 < 2s
- [ ] Photo uploaded survives a Railway redeploy
- [ ] Espo sync stub runs end-to-end; switching env to live writes a real Espo lead
- [ ] All admin/api routes use Permission middleware, not inline role checks
- [ ] No regressions on existing tests

**Phase B done:**
- [ ] Zero references to `ollama` in codebase
- [ ] All recommendations flow through the rule engine
- [ ] Admin can change a credit-policy param and rule engine picks it up on the next request
- [ ] Old questionnaire URL is gone or redirected
- [ ] AI Railway service decommissioned

**Phase C done:**
- [ ] Quick-lead screen saves a lead in <30s in field test
- [ ] Branch head sees a funnel chart with last-30-days data
- [ ] Reminder push fires for next-action-due leads at 9am

**Phase D done:**
- [ ] Mini-app saves a lead while in airplane mode; syncs on reconnect
- [ ] PDF in Uzbek and Russian both render correctly
- [ ] Consent signature stored and viewable
- [ ] Espo reconcile job runs nightly and posts result to admin

---

## 12. Out of Scope / Deferred

- **Bidirectional Espo sync** (only outbound for now)
- **ColVec1 / vision-LM retrieval models** — interesting, no current use case, contradicts AI-removal direction. Revisit at end of Phase D if document-search becomes a real user need.
- **VPS migration off Railway** — separate project, after pilot.
- **Credit committee workflow** (uncertain-history manual review escalation) — Phase E candidate.
- **Bulk SMS / email campaigns** — out of scope.
- **Customer-facing app** (the lead's side) — Mini-app is for the credit expert; the lead receives only the PDF.

---

## 13. Open Items (resolve before implementation plan)

1. **Espo creds** — user has admin access to Espo platform; need to extract API key + base URL before A3 stub→live cutover. Not a blocker for Phase A start.
2. **Telegram bot phone-link strategy** — for "send PDF via Telegram" (C4), confirm whether leads typically share Telegram username vs only phone. Affects fallback to WhatsApp.
3. **Branch naming convention** — repo has both `claude/...` and `feat/...` prefixes. Picking `feat/...` for production work, `claude/...` for spec/research artifacts.
4. **Rollback tag cadence** — recommend tagging on every Phase merge. User to confirm.

---

## 14. Implementation Plan Scope

The follow-on implementation plan should cover **Phase A only**, decomposed into ordered, testable steps. Phases B/C/D each get their own plan documents, written closer to their start date so we can incorporate what we learn from Phase A.

**Reasoning:** A single plan covering all four phases would be too long to execute well; commitments would calcify before we have evidence; cross-phase dependencies are limited (each phase has its own value).

---

*End of design. Implementation plan for Phase A to follow at `docs/superpowers/plans/2026-05-05-minerva-phase-a-plan.md`.*
