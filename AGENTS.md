# AGENTS.md

## Project intent

This repository powers a Telegram Mini App for SME banking workflow.
AI is a background capability, not a chatbot.

## Non-negotiable rules

- Do not add a free-form chat UI.
- Do not expose chain-of-thought or thinking text.
- Do not invent bank products, rates, policies, or eligibility rules.
- Recommendations must use backend-provided product catalog/context only.
- OCR / image extraction is mandatory.
- Preserve existing app structure and deployment conventions.
- Keep changes minimal and production-minded.

## Deployment target

- Railway project with separate services.
- Private Ollama service only.
- Persistent volume for Ollama models at `/root/.ollama`.
- Backend talks to Ollama over private Railway networking.

## Preferred endpoints

- `/api/ai/recommend-products`
- `/api/ai/generate-offer-summary`
- `/api/ai/translate`
- `/api/ai/extract-auto`
- `/api/ai/health`

## Model

- `gemma3:4b`

## Languages

- Russian
- Uzbek
- English optional

## UX

- AI should be triggered by forms/workflow steps/buttons.
- No generic "Ask AI" field unless explicitly requested later.

## Output discipline

- Prefer structured JSON for machine-consumed outputs.
- Return concise final text for user-facing summaries.
- Never expose reasoning fields even if provider returns them.
