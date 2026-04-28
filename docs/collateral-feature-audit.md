# Collateral Qualification Calculator - Implementation Audit

Spec: `minerva_collateral_feature_spec_v3.md` (Bank Ipak Yo'li, April 2026)

Repo: `JakhongirIsaev/Web-App-Starter`

Implementation commits: `f975894` (feature) + `a0a7e0f` (seed-gating fix)

## What Was Implemented

### Database (Drizzle + Postgres)

- `lib/db/src/schema/collateral.ts` - 4 tables: `collateral_types`, `collateral_items`, `collateral_estimates`, `collateral_estimate_items`
- `lib/db/src/schema/system-settings.ts` - generic key-value config table
- `lib/db/src/schema/activity.ts` - extended with `metadata jsonb` column
- `lib/db/drizzle/0002_collateral_and_settings.sql` - generated migration: 5 `CREATE TABLE`, 1 `ALTER`, 9 FKs, 6 indexes
- Seed: 5 collateral types + 3 default settings: `coverage_ratio=1.25`, `transport_age_threshold=7`, `transport_age_discount=0.4`

### Pure Logic

- `artifacts/api-server/src/lib/collateral-calc.ts` - `calculateAcceptedValue`, `calculateEstimateTotals`, `isEquipmentOnly`, `extractAnnualRate`
- `artifacts/api-server/src/__tests__/collateral-calc.test.ts` - 28 unit tests covering all 5 spec examples + edge cases

### API

11 routes in `artifacts/api-server/src/routes/collateral.ts`:

- `GET /collateral-types` - auth
- `PATCH /admin/collateral-types/:id` - admin
- `GET /admin/collateral-settings` - admin
- `PUT /admin/collateral-settings` - admin
- `GET /clients/:id/collateral-items` - client-access
- `POST /clients/:id/collateral-items` - client-access
- `PATCH /collateral-items/:id` - item-access via `requireCollateralItemAccess`
- `DELETE /collateral-items/:id` - soft delete; item-access
- `POST /clients/:id/collateral-estimates` - client-access
- `GET /clients/:id/collateral-estimates` - client-access
- `GET /collateral-estimates/:id` - estimate-access

Activity logging exists on all writes via `metadata jsonb`.

### Frontend

- Admin: `artifacts/admin/src/pages/collateral.tsx` (settings + types manager) + `<CollateralEstimatesCard>` on `pages/client-detail.tsx`
- Mini-app: `artifacts/mini-app/src/pages/collateral.tsx` (single multi-step page: list -> add -> estimate -> result + saved estimates) + entry button on `pages/client-detail.tsx`
- i18n keys (RU + UZ) in both apps

### PDF

- `artifacts/api-server/src/pdf/generate.ts` - added `PdfData.collateralEstimate` field + section render (RU + UZ copy)
- `artifacts/api-server/src/routes/mini-app.ts` `buildPdfPayload` - fetches the most recent estimate + item snapshots and includes them in the PDF payload

### OpenAPI

- `lib/api-spec/openapi.yaml` - 11 paths + 4 entity schemas added
- `pnpm --filter @workspace/api-spec run codegen` regenerates `lib/api-zod/src/generated/` and `lib/api-client-react/src/`
- Hand-written `lib/api-zod/src/collateral.ts` was deleted in favor of Orval-generated schemas; cross-field validation (`thirdPartyOwnerName` required when `isThirdParty=true`) moved inline to routes

## Known Issues, Risks, And Suspect Decisions

### Bugs

1. Seed-gating bug shipped to prod and was fixed in `a0a7e0f`.

   In the original commit `f975894`, `seedCollateralReferenceData()` was called inside `seedDatabase()`, which is gated by `SEED_DATABASE_ON_BOOT=false` in production. The first prod deploy left `collateral_types` and `system_settings` empty. Fix in `a0a7e0f` moves the call to `index.ts`, where it runs unconditionally on every boot. The comment on the function originally said "runs every boot regardless"; it did not.

2. No transaction around estimate creation.

   `routes/collateral.ts` `POST /clients/:id/collateral-estimates` inserts the parent estimate row, then inserts child `collateral_estimate_items` in a separate awaited insert. If the second insert fails, an orphan estimate row remains with `totalAcceptedValue` but no child items. This should be wrapped in `db.transaction(async (tx) => { ... })`.

3. Empty or duplicate `collateralItemIds` lookup edge case.

   The route validates `collateralItemIds.min(1)` via Zod, but the subsequent `inArray(...)` query and `items.length !== ids.length` check can produce generic error behavior on duplicates such as `[10, 10]`. The current mismatch check rejects duplicates, but it deserves a regression test and clearer error messaging.

### Test Coverage Gaps

4. No integration tests for routes.

   28 unit tests cover the calc layer; the 11 routes have zero automated coverage. The IDOR fix on `POST /storage/signed-url` (lookup by `storagePath` + `verifyClientAccess`) and the new `requireCollateralItemAccess` / `requireCollateralEstimateAccess` middleware are verified only by visual review and typechecking.

5. No test for the seed running unconditionally.

   The fix in `a0a7e0f` is verified manually. There is no test ensuring `seedCollateralReferenceData` is called on every boot regardless of `NODE_ENV` / `SEED_DATABASE_ON_BOOT`.

### Validation / Type Safety Asymmetries

6. Cross-field validation moved from Zod schema to inline route checks.

   When the hand-written `lib/api-zod/src/collateral.ts` was dropped to avoid a name collision with Orval-generated output, the `.refine(...)` for `thirdPartyOwnerName` required when `isThirdParty=true` was moved to `if (parsed.data.isThirdParty && !parsed.data.thirdPartyOwnerName)` blocks in the route handler. Future routes calling these endpoints, or anyone reusing the schema for client-side validation, will not get the cross-field check.

7. Frontend uses raw `api.get/post` instead of generated typed hooks.

   Orval generated typed React Query hooks (`useListCollateralTypes`, `useCreateCollateralItem`, etc.) into `lib/api-client-react`, but the admin and mini-app collateral pages still use raw `api.post(...)` / `apiFetch(...)`. TypeScript cannot catch shape mismatches at the call sites. These should be migrated.

8. Numeric/string asymmetry on the wire.

   Drizzle returns `numeric(18,2)` columns as JS strings. Entity schemas in OpenAPI declare `marketValue: string`, matching what is returned. Request body schemas use `number`, matching what JSON clients send. This is correct but awkward: the same field's type depends on direction. The frontend has to remember to call `Number(...)` on responses but pass numbers in requests.

### Money Math

9. JS floats for currency calculations.

   `collateral-calc.ts` uses native JS numbers + `toFixed(2)` rounding. For typical UZS amounts (millions to billions), precision is probably fine and tests pass with exact-equality assertions. But this is not bulletproof; a real banking system should use a decimal library such as `decimal.js` or `big.js`.

10. Float comparison in `resultStatus` decision.

    `coveragePercent >= coverageRatio * 100` can be fragile at exact thresholds if floating-point drift appears. Spec example 1 expects exactly 125% -> `enough`; the implementation currently passes that case by operand magnitude rather than by a decimal-safe comparison.

### Domain Model Gaps

11. `currency` field accepts anything, but only UZS is implemented.

    `collateral_items.currency text NOT NULL DEFAULT 'UZS'`; schema, calc, UI, PDF, and seed all assume UZS. If anyone posts `currency: "USD"`, the row stores it but downstream math silently sums across currencies.

12. `extractAnnualRate` loses information from rate ranges.

    `credit_products.rateUZS` is free-form text from Excel import (`"24%"`, `"24-26%"`, `"от 24%"`). The helper extracts the first number, so `"24-26%"` becomes `24`. The raw text is preserved in `annualRateAppliedRaw`, but if the UI displays the numeric column, it shows only the lower bound.

13. `hasEquipmentOnly` is informational, not enforced.

    Per spec, this is a warning, not a hard block. The backend stores it and the UI shows a warning. The estimate still saves. If business needs ever change to a hard block, the enforcement point is not centralized.

14. `POST /storage/signed-url` looks up document by `storagePath`, not ID.

    This works, but couples the auth check to path-as-identifier. If upload logic ever rewrites or moves a path mid-flight, signed URL requests would 404. The spec did not dictate this; using document ID would be more robust.

15. PDF only includes the most recent estimate.

    `buildPdfPayload` does `ORDER BY createdAt DESC LIMIT 1`. If a hunter creates multiple estimates per client, only the latest goes to the offer PDF. The spec did not specify this; it is an implicit design decision.

### Security

16. IDOR fix on signed URLs is correct but only covers the issuance path.

    `POST /storage/signed-url` now calls `verifyClientAccess`. Bearer-authenticated `GET /storage/file` calls also re-check. The signed-URL GET path trusts the signature alone, which is correct because the HMAC was minted by an authorized request. If `SIGNED_URL_SECRET` leaks, an attacker can forge URLs without ever passing through `verifyClientAccess`. Mitigations are short TTL (5 min) and documented secret rotation.

17. Activity log metadata has no schema.

    Each event type's metadata shape is determined at the call site. There is no type or runtime check. Long-term this can drift; queries assuming a particular shape can break silently.

18. `SignedDocImage` falls through to absolute URLs without validation.

    `artifacts/mini-app/src/pages/client-detail.tsx`: if `doc.storagePath` starts with `http`, the image renders that URL directly. The upload routes currently only write `/local-objects/...` paths, so this is not actively reachable, but it becomes an unbounded `<img src>` if upload logic changes.

### Operational

19. Production migration baseline procedure was needed and ran in this session.

    Prod was built via `db:push`, so `__drizzle_migrations` did not exist before deploying `0002`. The procedure in `docs/migrations.md` was followed: hashes for `0000` + `0001` inserted manually. It worked, but a duplicate-row issue surfaced because there is no `UNIQUE` constraint on the hash column. A second run inserted duplicates, then they were cleaned up by `DELETE WHERE id > 2`. Future baselines should use a `WHERE NOT EXISTS` insert pattern.

20. `verify-collateral.ts` confounds verify and seed.

    The one-off script at `lib/db/src/verify-collateral.ts` runs the inserts and prints state. It is useful as a runbook tool but semantically muddled. Either rename it to `seed-collateral.ts` or split it.

21. No `.env.example` update for the seed flag clarification.

    `SEED_DATABASE_ON_BOOT` now affects only demo data, not collateral reference data. The `.env.example` comment should call this out.

### Pre-existing Observations

22. `lightningcss-win32-x64-msvc` and friends in `optionalDependencies`.

    Windows-only binaries leak via pnpm into prod builds. This is harmless on Linux because pnpm skips them, but it adds unnecessary footprint in the lockfile.

23. Bearer tokens in `localStorage`.

    This is a pre-existing SPA pattern. It is susceptible to XSS exfiltration. It was not introduced by this feature but is worth noting for a holistic security pass.

24. `stderr` from OCR subprocess is captured but never logged.

    `storage.ts:189` captures OCR subprocess stderr but does not log it. OCR failures are hard to debug without that output.

## Verification Status

As of this audit:

| Gate | Status |
| --- | --- |
| `pnpm run typecheck` | Pass: 4/4 packages clean |
| `pnpm run test` | Pass: 13 files / 127 tests pass |
| `pnpm run lint` | Pass: 0 errors / 16 warnings, all pre-existing |
| Migration `0002` applied to prod | Pass: via `pnpm --filter @workspace/db run migrate` after manual baseline |
| Seed populated in prod | Pass: via `verify-collateral.ts` manual fallback after seed-gating bug |
| api-server cutover to per-service Dockerfile | Pass: via Railway Config-as-Code |
| admin + mini-app cutover | In progress at time of audit |
| End-to-end smoke test from mini-app UI | Not yet run |

## Files For Codex To Spot-Check First

Highest-risk files:

1. `artifacts/api-server/src/routes/collateral.ts` - auth, validation, transaction boundaries, IDOR fix
2. `artifacts/api-server/src/lib/collateral-calc.ts` - float math, edge cases
3. `artifacts/api-server/src/lib/system-settings.ts` - `readNumber` fallback behavior, key spelling
4. `artifacts/api-server/src/index.ts` - seed call ordering, env validation
5. `artifacts/api-server/src/routes/mini-app.ts` `buildPdfPayload` - extra DB query, language fallback for type names
6. `artifacts/mini-app/src/pages/collateral.tsx` - state machine correctness, race conditions on rapid clicks
7. `lib/api-zod/src/generated/api.ts` - verify Orval output matches handlers' expectations

## Recap

Collateral feature rollout status:

- `api-server` is deployed and seeded.
- `admin` and `mini-app` still need cutover.
- Next Railway step: set Config-as-Code path and `BASE_PATH` / `TZ` / `VITE_API_ORIGIN` variables on `@workspace/admin` and `@workspace/mini-app`.
