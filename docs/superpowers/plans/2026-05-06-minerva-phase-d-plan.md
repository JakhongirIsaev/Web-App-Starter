# Minerva Phase D Implementation Plan (Sketch)

**Goal:** Field hardening — make the app robust for real users in market conditions.

**Spec:** `docs/superpowers/specs/2026-05-05-minerva-changes-design.md` § 7.

## Order

1. **D2 — Bilingual PDF** (small, polish)
2. **B4 — Decommission Ollama** (cleanup, saves $$, completes Phase B)
3. **D3 — Signature/consent capture** (legal pre-launch)
4. **D4 — Espo two-way reconcile** (bank payout audit)
5. **D1 — Offline mode** (biggest, do last)

Each ships independently as its own PR.

---

## D2 — Bilingual PDF

`clients.preferredLanguage` text column ("ru" | "uz", nullable). The leave-behind generator already supports both languages — just plumb the per-client preference. Default to expert's UI locale if unset.

UI: language selector on new-client form (next to gender). Optional, defaults to "ru".

Files: `clients` schema + migration; mini-app new-client form input; PDF endpoint passes `client.preferredLanguage` to `generateLeaveBehindPdf`.

## B4 — Decommission Ollama

Code: delete `artifacts/ollama-ai/`, `artifacts/api-server/src/ai/`, `artifacts/api-server/src/routes/ai.ts`. Update OpenAPI to remove AI endpoints. Manually remove the Railway `ollama-ai` service + env vars.

## D3 — Signature/consent capture

Mini-app new-client form gets a signature pad (HTML5 canvas → PNG dataURL → existing photo upload endpoint with `docType: "consent_signature"`). Required before save. Display read-only on admin client-detail.

Files: new `<SignaturePad>` component; new-client form integrates it; admin client-detail shows it; legal copy in i18n.

## D4 — Espo two-way reconcile

Daily worker job: `espo-reconcile`. Pulls Espo lead IDs created in last 24h, diffs against local `clients.espoLeadId` set. Surfaces mismatches in admin Espo Sync page.

Endpoint: `GET /admin/espo-sync/reconciliation`. Adds a card on the existing Espo Sync admin page.

## D1 — Offline mode

Mini-app: register a service worker via Vite PWA plugin. `POST /mini-app/clients` writes to IndexedDB queue when offline. On reconnect: drain queue, POST each, on success delete from queue. Idempotency via `external_uuid` (already on schema).

UI: small "Offline" badge in header. Pending-sync count.

Files: `vite-plugin-pwa` dep; service worker manifest; queue helper; offline banner; mutation wrapper that handles offline.

---

## Out of scope

- Live Espo (needs creds from user — separate manual step)
- Rule engine connected to live products (needs schema migration to numeric rates — task #20)
- Phase E and beyond (committee workflow, bulk SMS/email, customer-facing app)

---

*End of Phase D sketch.*
