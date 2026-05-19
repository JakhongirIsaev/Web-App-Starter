# Minerva Stress Test Plan
*Generated 2026-05-19. Pre-launch readiness gate.*

## Goal
Validate that the API can handle 5–10 concurrent SME bank staff using the Telegram Mini App (lead intake → PDF generation → Espo sync) without timeouts or data loss. Prove that the most expensive operations (PDF rendering, OCR, Espo queueing) degrade gracefully under load rather than cascading failures.

## Test Tiers
- **Tier 1 (smoke):** 2 concurrent users, 5 minutes — sanity check: all hot paths respond under 2s
- **Tier 2 (realistic peak):** 5 concurrent users, 15 minutes — modeled after concurrent hunters at branch during lunch rush
- **Tier 3 (breaking point):** 10 concurrent users, 10 minutes — find where latency hits 10s or error rate > 2%

## Hot Paths (in priority order)

### Path 1: Client Creation (lead intake) — Priority 1
- **Endpoint(s):** `POST /clients` (artifacts/api-server/src/routes/clients.ts:159)
- **Why it matters:** First action every SME rep takes. Blocks entire workflow if it fails or hangs.
- **Expected load:** 10 clients/minute during peak; each triggers Espo queue job (fire-and-forget).
- **Pass criteria:** p95 latency < 500ms; error rate < 0.5%; success rate > 99.5%
- **Risk if it breaks:** Hunters can't create leads → no pipeline → zero revenue.
- **Known concerns:** 
  - Calls `enqueueEspoSync()` (fire-and-forget via graphile-worker). Non-blocking but queue hiccups could log errors.
  - DB transaction wraps INSERT only — no lock contention expected.
  - No rate limit on endpoint itself (only on auth routes).

### Path 2: PDF Generation (leave-behind doc) — Priority 1
- **Endpoint(s):** `POST /mini-app/clients/:id/generate-pdf` (artifacts/api-server/src/routes/mini-app/pdf.ts:34)
- **Why it matters:** CPU + memory intensive; blocks user while rendering; required before Telegram send.
- **Expected load:** 5–10 PDF renders/minute (one per client after recommendation stage); PDFKit in-process.
- **Pass criteria:** p95 latency < 5s; p99 latency < 15s; error rate < 1%; no OOM
- **Risk if it breaks:** Field expert can't hand off quote → deal dies → revenue lost.
- **Known concerns:**
  - **No rate limit** on endpoint — a single user hammering it could saturate Node CPU.
  - PDFKit renders in-process (synchronous PDFDocument creation). No worker pool or queue.
  - Must fetch client, branch, expert user, collateral calcs, and offer details (multiple DB queries).
  - Rendering payload size unknown; if collateral list is huge (100+ items), PDF could balloon.
  - Language resolution happens inline; no caching.

### Path 3: Document Upload + OCR — Priority 2
- **Endpoint(s):** 
  - `POST /storage/upload-document` (artifacts/api-server/src/routes/storage.ts:446)
  - `POST /ocr/recognize` (artifacts/api-server/src/routes/storage.ts:397)
- **Why it matters:** User supplies passport/STIR scan; OCR extracts identity fields; blocks UI while running.
- **Expected load:** 2–5 OCR jobs/user/visit; each doc is 1–5MB; OCR is out-of-process (Ollama HTTP or local Python).
- **Pass criteria:** p95 latency < 8s; error rate < 5% (OCR is error-prone); no file corruption
- **Risk if it breaks:** Can't verify client identity → compliance risk → can't disburse.
- **Known concerns:**
  - **No rate limit** on `/ocr/recognize`.
  - Upload limit: 25MB (multer.memoryStorage); stores raw buffer in memory before R2 upload.
  - OCR timeout hardcoded; if Ollama/local service is slow, requests queue in Node memory.
  - Multipart upload must succeed end-to-end; partial uploads fail silently.
  - R2 backend required for `/storage/upload-document` (returns 503 without STORAGE_BACKEND=r2).

### Path 4: List Clients (dashboard) — Priority 2
- **Endpoint(s):** `GET /clients` (artifacts/api-server/src/routes/clients.ts:86)
- **Why it matters:** Admin dashboard refreshes often; branch_head filters by branchId; search is full-text ilike.
- **Expected load:** 20–30 requests/minute from multiple admins; default pageSize=20.
- **Pass criteria:** p95 latency < 1s; error rate < 0.5%; no full-table scans
- **Risk if it breaks:** Dashboard stalls; admins can't see pipeline health.
- **Known concerns:**
  - Joins on branches + users tables (leftJoin). Indexes exist: clients_branch_id_idx, clients_assigned_to_id_idx, clients_status_idx.
  - Search uses ilike(fullName, `%...%`) — **can degrade on large tables** if index not used. No COLLATE strategy visible.
  - No pagination lock; concurrent page requests could miss rows.

### Path 5: Espo Sync (async background queue) — Priority 2
- **Endpoint(s):** Job runner (graphile-worker; triggered via `enqueueEspoSync()` in clients.ts:179)
- **Job file:** artifacts/api-server/src/jobs/espo-sync.ts:11
- **Why it matters:** Syncs lead data to Espo CRM; idempotent but expensive (HTTP to external Espo API).
- **Expected load:** 50–100 jobs queued during 5-minute peak; max 10 retries per job; no rate limit on Espo calls visible.
- **Pass criteria:** job completion time < 10s each; 95% success rate; no stuck jobs
- **Risk if it breaks:** Leads don't sync to CRM → sales can't see prospects → follow-up delayed.
- **Known concerns:**
  - **No visible rate limit or throttle** on Espo HTTP calls. If 50 jobs dequeue simultaneously, could hammer Espo API.
  - Job idempotency relies on `externalUuid` lookup; if Espo is slow, duplicate createLead calls possible under retry.
  - Worker startup/concurrency config not visible in this scan — assume default graphile-worker settings (likely 1 worker per core).
  - Non-fatal queue failures (quickAddJob fails) still log client insert successfully, but job row may not dequeue.

## Tooling
**Recommended: k6** (load testing DSL, real-time metrics, easy CI integration)
- Why k6: Golang-based, handles concurrent VUs natively, great for API endpoints, integrates with Railway monitoring, small binary.
- Alternative: Artillery (Node.js, simpler syntax) or Locust (Python, flexible) if team prefers.
- Sample script skeleton: `artifacts/api-server/load-test.k6.js` (to be created; template in k6 docs).

## Test Data
1. **Seed test branch & users:** Run `SEED_DEMO_USERS=true npm run migrate && npm run seed` locally or in v2-preview env.
   - Creates ~5 demo branch_heads + 1 superadmin with password "password" (hardcoded in seed).
   - Do NOT enable DEMO_MODE in production; auth middleware crashes if NODE_ENV=production and DEMO_MODE=true.
2. **Load test branch:** Use v2-preview environment (Railway postgres + Redis), not production.
3. **Espo mock (optional):** If Espo API is not ready, mock it with a stub HTTP server returning 200 with fake Lead IDs. Queue will still process; allows isolated API stress test.
4. **Cleanup:** After test, purge test clients from v2-preview DB to avoid data pollution.

## Pre-test Checklist
- [ ] Target: `v2-preview` environment (verify DATABASE_URL points to staging postgres, not prod).
- [ ] Ollama AI service is running (or is DISABLED and OCR test is skipped for Tier 1/2).
- [ ] graphile-worker is configured and running (check Railway service logs for "worker: listening").
- [ ] R2 credentials are provisioned in v2-preview (STORAGE_BACKEND=r2; if local-fs only, skip /storage/upload-document tests).
- [ ] Espo API is reachable or mocked (check integration/espo/client.ts for API URL; if offline, queue jobs will retry and fail gracefully).
- [ ] Database indexes are current: `SELECT * FROM pg_indexes WHERE tablename LIKE 'clients%';` should show ~6 indexes.
- [ ] Session store is clean: `DELETE FROM auth_sessions WHERE expires_at < NOW();` to avoid old sessions interfering.
- [ ] Mini-app URL is set (MINI_APP_URL env var; used in PDF generation).
- [ ] Telegram bot token is dummy or test-only (TELEGRAM_BOT_TOKEN; not production token).

## Out of Scope (this round)
- Telegram webhook scalability (bot message delivery is handled by Telegram; not Minerva's responsibility).
- Collateral module endpoints (`POST /collateral/calculate`, etc.) — collateral is lower priority than lead intake + PDF.
- Admin report generation (`GET /admin/activity-log`) — read-only, low cardinality.
- Auth login/password reset endpoints — already rate-limited; not a bottleneck.
- Articles/knowledge base (`GET /articles`) — static reference data, not user-facing critical path.
- Credit product / policy parameter endpoints — reference data, low write frequency.
