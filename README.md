# Web App Starter

This repository contains the Railway-deployed SME banking workflow app:

- `artifacts/api-server` is the backend API and Telegram bot process
- `artifacts/mini-app` is the Telegram Mini App frontend
- `artifacts/admin` is the admin web frontend

## Recommendation engine

The Mini App does not expose a chatbot. Product recommendations are produced
by a deterministic rule engine in the backend:

- questionnaire answers -> `/api/mini-app/recommend` filters and ranks the
  allowed catalog
- offer summary text comes from a static template
  (`artifacts/api-server/src/lib/offer-summary.ts`)
- OCR review uses the local OCR pipeline only — translation/auto-extract via
  LLM is removed

Allowed bank products are determined entirely by backend-controlled catalog
data. The previous Ollama AI service was decommissioned in Phase B4.

## Railway services

Recommended Railway service mapping:

- `backend-api` -> `artifacts/api-server`
- `miniapp-web` -> `artifacts/mini-app`
- `admin` -> `artifacts/admin`

## Deployment and rollback

Detailed Railway steps are documented in `docs/railway-deployment.md`.

Git workflow remains:

- `main` = stable production
- `v1.0.0` = current stable baseline tag
- `v2` = ongoing deployment/integration branch

Rollback options:

- keep Railway `production` on `main`
- test changes in the preview/staging environment first
- if a preview deploy fails, redeploy the last healthy backend and frontends without touching `main`
