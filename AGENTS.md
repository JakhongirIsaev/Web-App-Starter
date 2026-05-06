# AGENTS.md

## Project intent

This repository powers a Telegram Mini App for SME banking workflow.
Recommendations and offer summaries are produced by deterministic backend
logic, not by an LLM.

## Non-negotiable rules

- Do not add a free-form chat UI.
- Do not invent bank products, rates, policies, or eligibility rules.
- Recommendations must use backend-provided product catalog/context only.
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

- `/api/mini-app/recommend` — deterministic ranking of allowed products from
  the client's intent fields (purpose, desired amount, term, currency, etc.)
  captured via the fixed new-client form.
- Static templates render the offer summary (no AI endpoint).

## Languages

- Russian
- Uzbek
- English optional

## UX

- The multi-step questionnaire was removed in Phase B3 (replaced by a single
  fixed new-client form with sections: Identity, Lead source, Loan intent,
  Self-check, Consent signature). Do not reintroduce a questionnaire flow.
- Recommendations are triggered when a client is saved with all self-check
  flags true and the loan intent fields populated (status auto-promotes to
  `lead`).
- No generic "Ask AI" field.

## Output discipline

- Prefer structured JSON for machine-consumed outputs.
- Return concise final text for user-facing summaries.
