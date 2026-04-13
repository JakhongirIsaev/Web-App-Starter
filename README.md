# Web App Starter

This repository contains the Railway-deployed SME banking workflow app:

- `artifacts/api-server` is the backend API and Telegram bot process
- `artifacts/mini-app` is the Telegram Mini App frontend
- `artifacts/admin` is the admin web frontend
- `artifacts/ollama-ai` is the new private Ollama service for background AI

## AI architecture

The Mini App does not expose a chatbot. Background AI is triggered only from workflow screens:

- questionnaire -> `/api/ai/recommend-products`
- vehicle document review -> `/api/ai/extract-auto`
- OCR translation buttons -> `/api/ai/translate`
- PDF generation workflow -> `/api/ai/generate-offer-summary`

The backend remains the single integration point for AI. It calls Ollama over Railway private networking using:

- `OLLAMA_URL=http://ollama-ai.railway.internal:11434`
- `OLLAMA_MODEL=gemma3:4b`

Allowed bank products are still determined by backend-controlled catalog data. AI only ranks/explains within the allowed list and never replaces business rules.

## Railway services

Recommended Railway service mapping:

- `backend-api` -> `artifacts/api-server`
- `miniapp-web` -> `artifacts/mini-app`
- `admin` -> `artifacts/admin`
- `ollama-ai` -> `artifacts/ollama-ai`

The `ollama-ai` service must stay private and must have a persistent Railway volume mounted at `/root/.ollama`.

## Deployment and rollback

Detailed Railway steps are documented in `docs/railway-deployment.md`.

Git workflow remains:

- `main` = stable production
- `v1.0.0` = current stable baseline tag
- `v2` = ongoing deployment/integration branch

Rollback options:

- keep Railway `production` on `main`
- test AI/Ollama changes in the preview/staging environment first
- if a preview deploy fails, redeploy the last healthy backend and frontends without touching `main`
