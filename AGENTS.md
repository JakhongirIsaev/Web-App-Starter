# AGENTS.md

## Project intent

This repository powers a Telegram Mini App for SME banking workflow.
Credit experts capture leads, fill credit applications, and pick products
manually from a read-only knowledge base. Offer summaries are static
templates, not LLM output.

## Non-negotiable rules

- Do not add a free-form chat UI.
- Do not invent bank products, rates, policies, or eligibility rules.
- Do not auto-recommend products (Phase E removed the rule engine).
  Experts pick products manually from the catalog. The catalog is read-only
  knowledge — the system never decides which product fits a client.
- OCR / image extraction is mandatory.
- Preserve existing app structure and deployment conventions.
- Keep changes minimal and production-minded.

## Deployment target

- Railway project with separate services.
- Backend (`backend-api`), Mini App (`miniapp-web`), Admin (`admin`),
  PostgreSQL.
- The previous `ollama-ai` service was decommissioned in Phase B4 — do not
  re-introduce it without an architecture change.

## Preferred endpoints

- `/api/mini-app/products` — full read-only product catalog. Experts pick
  manually; the page formerly known as "recommendation" now renders this
  list as a knowledge base. The legacy `/api/mini-app/recommend` endpoint
  still responds for backward-compat but is not used by the current UI.
- `/api/mini-app/clients/:id` (PUT) — accepts the credit-application
  fields (purpose, desiredAmountUzs, desiredTermMonths, preferredCurrency)
  and auto-promotes status `lead` → `recommendation` when all four are
  populated.
- `/api/mini-app/basket` — manual product selection. Promotes status to
  `basket` and feeds the existing KP/PDF flow.
- Static templates render the offer summary (no AI endpoint).

## Languages

- Russian
- Uzbek
- English optional

## UX

- The multi-step questionnaire was removed in Phase B3 and the fixed
  new-client form was simplified further in Phase E.
- New-client form (Phase E) captures only: full name, phone, gender,
  preferred language, legal entity name (yuridik nomi), business type,
  Telegram username, geolocation, and a consent checkbox. Self-check
  booleans, lead source, loan intent, and the signature pad are gone.
- The credit application (purpose, desired amount, term, currency) is
  filled later on the client-detail screen, not at lead time. Saving
  those fields promotes status `lead` → `recommendation` (repurposed:
  "credit info ready, needs product picked").
- Picking a product manually from the catalog promotes status
  `recommendation` → `basket`. From there the existing KP/PDF flow runs.
- Do not reintroduce: questionnaire, self-check booleans, signature pad,
  auto-recommendation engine.
- No generic "Ask AI" field.

## Status lifecycle (Phase E)

```
draft → lead → recommendation → basket → pdf_generated → under_review
                                                          → approved
                                                          → completed
                                                          → rejected
```

- `draft`: client row exists but no identity field set yet.
- `lead`: at least one of fullName/phone/legalName saved.
- `recommendation`: credit-application fields populated (does NOT mean
  the system recommended anything — name kept for back-compat).
- `basket`: expert manually selected one or more products from catalog.
- `pdf_generated`: KP exported.
- Terminal: `under_review`, `approved`, `completed`, `rejected`.

## Output discipline

- Prefer structured JSON for machine-consumed outputs.
- Return concise final text for user-facing summaries.
