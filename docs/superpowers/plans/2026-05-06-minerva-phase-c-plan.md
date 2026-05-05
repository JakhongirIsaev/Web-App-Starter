# Minerva Phase C Implementation Plan (Sketch)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Marketing power-ups for credit experts in the field — rapid lead-capture, daily dashboards, funnel reports, send-PDF-via-Telegram, button-placement cleanup, follow-up reminders.

**Architecture:** Each item is independent and ships as its own PR. Order picked for user-visible-impact-vs-effort.

**Tech Stack:** Same as before — React 19 + Vite + TanStack Query for both apps, Express 5 + drizzle for server, lucide-react for icons.

**Spec:** `docs/superpowers/specs/2026-05-05-minerva-changes-design.md` § 6.

---

## Order

1. **C5 — Button placement redesign + Edit/Deactivate users** (small, addresses user complaint + closes follow-ups #14, #15)
2. **C4 — Send PDF to lead via Telegram** (small, reuses existing PDF + Telegram delivery)
3. **C6 — Reminders / follow-up** (medium, reuses `client_next_actions` table)
4. **C2 — Today's-leads dashboard for credit expert** (medium)
5. **C3 — Funnel report for branch heads** (medium)
6. **C1 — Rapid lead-capture screen** (big — one-screen field-mode capture)

Each ships independently. After C5, ship-and-test before moving on.

---

## C5 — Button placement redesign

**Branch:** `feat/admin-buttons-redesign` off `main`.

Steps:
1. Investigate user's missing-buttons report:
   - Check `artifacts/admin/src/pages/users.tsx` — does it have "Add user" / "Import" / "Export" buttons currently? Did A4.4 RBAC refactor accidentally hide them?
   - If hidden by permission gating bug, fix.
2. Apply button placement principles per spec § 6.C5:
   - Primary action top-right (1 button).
   - Secondary actions in overflow menu (3-dot icon button next to primary).
   - On mobile width: primary becomes a sticky bottom-right FAB.
3. Add **Edit** dialog (per task #15) — opens existing edit pattern.
4. Add **Deactivate** action — sets `users.is_active = false` (column already exists). Reactivate also.
5. Pages to revise:
   - `admin/src/pages/users.tsx` — Edit + Deactivate per row, Add User as primary action
   - `admin/src/pages/clients.tsx` — Import/Export to overflow
   - `admin/src/pages/articles.tsx`
   - `admin/src/pages/credit-products.tsx`
   - `admin/src/pages/collateral.tsx`
6. Add backend `POST /admin/users/:id/deactivate` and `POST /admin/users/:id/reactivate` endpoints, gated by `user.update` permission.

Acceptance: All listed pages have a clean primary+overflow layout, Edit + Deactivate work, no regressions.

---

## C4 — Send PDF to lead via Telegram

**Branch:** `feat/send-pdf-telegram` off `main`.

The PDF generator already produces a leave-behind. The bot already has `sendDocument` capability (used in `/generate-pdf` flow). This task wires a one-tap "Send to lead via Telegram" button on the client-detail page.

Steps:
1. New button on `mini-app/pages/client-detail.tsx`: "Send to client via Telegram"
2. New endpoint `POST /mini-app/clients/:id/send-pdf-to-lead`:
   - Generates PDF (same flow as `/generate-pdf`)
   - If client has `telegramId`: bot.api.sendDocument(client.telegramId, pdfBuffer, ...)
   - If client has only phone: return a `wa.me/<phone>` URL the expert can share
   - Returns `{ delivered: "telegram"|"whatsapp_url"|"failed", url?: string }`
3. UI shows toast on success / opens WhatsApp on fallback

Schema: add `telegramId` to clients if not present. Optional.

Acceptance: clicking button delivers PDF to client's Telegram (or returns WhatsApp URL) within a few seconds.

---

## C6 — Reminders / follow-up

**Branch:** `feat/reminders` off `main`.

Reuses existing `client_next_actions` table. Adds:

1. UI: edit dialog on client-detail in mini-app + admin to create/update next-action rows. Fields: action_date, description, priority.
2. Worker job (graphile-worker): `daily-reminder-scan`. Runs at 09:00 Asia/Tashkent every day.
   - Query: `client_next_actions WHERE action_date <= today AND is_completed = false`.
   - For each: send Telegram message to assigned expert via grammy bot.
3. Cron schedule via graphile-worker's `addCronJobs` API.

Acceptance: setting a next-action for tomorrow → tomorrow at 9am, expert receives Telegram message linking to client.

---

## C2 — Today's-leads dashboard for credit expert

**Branch:** `feat/my-day-dashboard` off `main`.

New mini-app page or extend home page with:
- Today's lead count
- This-week lead count
- Last-7-days conversion funnel (count of clients in each status)
- Click section → filtered client list

New endpoint: `GET /mini-app/dashboard/me` returning the aggregates for the requesting user.

Acceptance: open mini-app → home → see today's number tick up after saving a new lead.

---

## C3 — Funnel report for branch heads

**Branch:** `feat/funnel-report` off `main`.

New admin page `/admin/funnel`:
- Filters: branch, date range, expert, lead source
- Output: bar/funnel chart showing counts at each status (lead → pdf_generated → approved → completed)
- Conversion percentage labels

Endpoint: `GET /admin/reports/funnel?branch=&from=&to=&expert=&source=` returning aggregates.

Use a simple chart library (e.g., recharts) or hand-coded SVG bars.

Acceptance: branch head opens funnel → sees their branch's last-30-days conversion at-a-glance.

---

## C1 — Rapid lead-capture screen

**Branch:** `feat/rapid-lead-capture` off `main`.

New mini-app page `/quick-lead`:
- One screen layout
- Fields: name (text), phone (tel), business type (3-tap chips), GPS pin (auto from browser geolocation), photo (camera button → preview), voice note (mic button → 30s max)
- Save button → persists, fires Espo sync (existing), returns to home with a success toast

Reachable from a Floating Action Button on the home page.

The full new-client form remains for full data entry.

Acceptance: in the field, expert can capture a lead in <30 seconds end to end.

---

## Out of Scope for Phase C

- Phase D items (offline mode, bilingual PDF, signature, Espo reconcile).
- Migrating credit-products rates to numeric (separate follow-up).

---

*End of Phase C plan.*
