# Phase A Completion — May 2026

**Status:** All four sub-phases shipped to `main`.
**Tag:** `v2.5.0`
**Spec:** `docs/superpowers/specs/2026-05-05-minerva-changes-design.md`
**Plan:** `docs/superpowers/plans/2026-05-05-minerva-phase-a-plan.md`

## Merged PRs

| # | Title | Phase |
|---|---|---|
| 2 | RBAC: Permission middleware + capability matrix | A4 |
| 3 | PDF: 1-page leave-behind redesign + bundled fonts | A1 |
| 4 | Storage: Cloudflare R2 backend (env-flagged) + admin photo gallery | A2 |
| 5 | Espo: outbound lead sync (stub mode) + admin panel | A3 |

## What is now live in production

- **RBAC** active: every protected route uses `requirePermission`, capability matrix at `docs/roles-and-permissions.md`.
- **PDF redesign** active: both `POST /generate-pdf` and `GET /download-pdf` produce the new 1-page leave-behind. Cyrillic/Uzbek-Latin renders via bundled DejaVuSans.
- **R2 storage code** deployed but **inactive** until env vars set. Default is local-FS (current behavior).
- **Espo sync code** deployed but **inactive** until worker service provisioned. Stub mode runs end-to-end without external Espo when activated.
- **Gender field** visible on client lists and detail headers in both apps.
- **users.phone** column populated from admin user form.

## Setup actions YOU need to take to activate the new features

### 1. Run `pnpm install` once on a clean checkout
The sandbox couldn't run install during implementation (Node 25 + Windows + POSIX-style symlinks). On your normal dev machine:

```
cd D:\Minerva\web-app-starter
pnpm install
```

This regenerates `pnpm-lock.yaml` with `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, and `graphile-worker`. CI/Railway will do this automatically on first build.

### 2. Run codegen + drizzle-kit verify (optional sanity)
```
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/db drizzle-kit generate
git status
```
Should show zero diff. If diffs appear, commit them — they're regenerations of files we hand-edited because codegen was sandbox-blocked.

### 3. Activate Cloudflare R2 storage

R2 fixes the "pictures not saving" issue.

1. Log in to Cloudflare → R2 → create a bucket (e.g., `minerva-prod-uploads`).
2. R2 → Manage R2 API Tokens → create a token with `Object Read & Write` for the bucket.
3. Note the **Access Key ID**, **Secret Access Key**, and your **Account ID**.
4. R2 → bucket → Settings → enable a public bucket URL OR connect a custom domain.
5. In Railway → api-server service → Variables, add:
   - `R2_ACCOUNT_ID=<your account id>`
   - `R2_ACCESS_KEY_ID=<token id>`
   - `R2_SECRET_ACCESS_KEY=<token secret>`
   - `R2_BUCKET=minerva-prod-uploads`
   - `R2_PUBLIC_BASE_URL=<https://pub-xxxx.r2.dev or https://your-custom-domain>`
   - `STORAGE_BACKEND=r2`
6. Redeploy api-server. Smoke test: upload a photo via mini-app, redeploy, photo still loads.

### 4. Activate Espo outbound sync

Espo is revenue-critical (per-lead payouts).

**Step A — Provision the worker Railway service (one-time):**
1. Railway → same project as api-server → New Service → from same Git repo + branch (`main`)
2. Settings → Custom Start Command: `pnpm --filter @workspace/api-server run worker`
3. Settings → disable healthcheck or set a path that always returns 200
4. Variables — copy from api-server: `DATABASE_URL`, `TZ=Asia/Tashkent`
5. Deploy. Watch logs for graphile-worker boot messages.

**Step B — Stub mode verification (recommended before going live):**
1. Save a new client via mini-app
2. Admin → Espo Sync page → confirm a row appears as `pending` then `succeeded` within 30s
3. The `espo_lead_id` will start with `stub-` — that's expected for stub mode

**Step C — Switch to live Espo:**
1. In EspoCRM admin → API Tokens → create a token with Lead permissions
2. In Railway, on BOTH api-server AND worker services, add:
   - `ESPO_INTEGRATION=live`
   - `ESPO_BASE_URL=https://<your-espo-host>` (no trailing slash)
   - `ESPO_API_KEY=<token>`
3. Redeploy both. Save a new client. Espo Sync admin shows `succeeded` and the lead ID is the real Espo Lead ID.

### 5. (Optional) Verify in Railway that production deploy is green

Railway production deploys from `main`. Confirm the latest build succeeded after each PR merge. If any deploy is red, the most likely cause is the codegen/drizzle drift mentioned in step 2 — run codegen and commit the regen.

## Behavior changes shipped in Phase A

- **Branch heads can now update clients in their branch** (previously denied via inline check).
- **PDF expert info** comes from `client.assignedToId` (the assigned credit expert), not whichever colleague clicked "Generate PDF".
- **PDF generation requires the assigned expert to have a phone on file** — returns `400 expert_missing_contact` otherwise.
- **All photo URLs are now signed** via `/storage/signed-url` (15-minute TTL for sensitive docs).

## Rollback procedure

If something breaks in production:
```
git revert -m 1 <merge-sha-of-the-bad-PR>
git push origin main
```
Railway auto-deploys the revert.

To go back to pre-Phase-A entirely:
```
git checkout main
git reset --hard v2.0.0-pre-may-2026
git push --force origin main   # caution: rewrites history
```

## Phase B / C / D
Out of scope for Phase A. Plans to be written closer to start dates per the spec § 14.

Phase B preview: Replace AI surfaces with rule-based equivalents, fixed client form (replaces questionnaire), admin "Credit Policy Parameters" page, decommission Ollama service.

## Operational notes

- Tag `v2.0.0-pre-may-2026` is the pre-Phase-A baseline.
- Tag `v2.5.0` is the Phase-A completion marker.
- Railway's `v2-preview` environment is now stale (it tracks `v2`, which is 50+ commits behind `main`). Either delete it or repurpose to track `main` for staging.
