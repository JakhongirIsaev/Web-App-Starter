# Design Audit — 2026-05-06

Author: Claude (focused pass before Codex handoff)
Surfaces reviewed: mini-app new-client form, mini-app home (dashboard + FAB), admin Credit Policy, admin Funnel, admin login page (suspect — see Finding #1).
Method: visual audit of captured screenshots + spot-checks against `login.tsx`, `layout.tsx`, `app.ts`, `AGENTS.md`.

This is a punch list for Codex over the next 2 days. Findings are ordered by **impact-to-effort ratio**, not severity.

---

## TL;DR — top quick wins (≤30 min each)

1. **Fix double-comma in greeting** ("Доброй ночи,, Jahongir Isayev").
2. **Investigate `admin-home.png`** — captured surface shows "VRAPIDA Admin" with Google/GitHub OAuth, which is not what `artifacts/admin/src/pages/login.tsx` renders. Either a stale build is deployed, the wrong URL was screenshotted, or there's an unintended boilerplate page still wired up.
3. **De-duplicate "ФИО (можно позже)"** label — appears as both card heading and field label.
4. **Replace skeleton-forever on Funnel** with a real empty state.
5. **Pick one "selected" pill style** — currency uses green outline+fill, language uses navy fill. Coexisting in the same form.

---

## Findings

### 1. Admin login page may be stale or wrong URL  ⚠ verify first
- File: `qa-shots/admin-home.png`
- Captured page shows "VRAPIDA Admin / Sign in to access the admin dashboard" with **Continue with Google** and **Continue with GitHub** buttons.
- Source of truth (`artifacts/admin/src/pages/login.tsx`) renders a Minerva-branded split layout with Telegram ID + password and a demo-credentials card.
- Action for Codex: confirm `https://workspaceadmin-production-7e8d.up.railway.app/admin` (or whichever domain is canonical) actually serves the Minerva login. If a leftover Replit/v0 boilerplate page is wired up at `/login` or root, remove it. This is the kind of thing that destroys credibility if a stakeholder hits it.

### 2. Double comma in greeting
- File: `qa-shots/mini-app-home.png`
- "Доброй ночи,, Jahongir Isayev" — extra comma. Probably a template string like `${greeting},${punctuation},${name}` or a stale i18n key.
- Action: grep `"Доброй"` and `"greeting"` across `artifacts/mini-app/src/**` and the i18n RU/UZ JSON files; fix the formatting.

### 3. Duplicate field labels in new-client form
- File: `design-shots/mini-new-client.png`
- "ФИО (можно позже)" appears **twice** — once as the white-card section heading, once as the field's `<label>` directly below.
- Likely the same pattern repeats for any single-field section (Phone, Telegram).
- Fix: when a card holds a single field, drop the section heading and let the field's label stand alone. When a card holds 2+ fields, keep a distinct grouping heading (e.g. "Контакты") that is *not* the same string as any inner label.

### 4. Funnel page renders permanent skeletons when empty
- File: `qa-shots/admin-funnel.png`
- All 7 placeholder boxes stay mint-tinted forever. Looks like an infinite loading spinner.
- Fix: replace the skeleton state with an empty-state component once `data` resolves to `[]`. Suggested copy: *"Воронка пуста — создайте первого клиента, чтобы увидеть метрики."* with a CTA link to `/clients/new`.

### 5. Conflicting "selected pill" treatments in new-client form
- File: `design-shots/mini-new-client.png`
- Currency UZS (selected) = green outline + light green fill.
- Language RU (selected) = solid dark navy fill, white text.
- Both are pill-style toggles in the same form. Pick one and apply consistently. Recommendation: use the green outline+fill style for all single-value toggles (less visually heavy on a long form).

### 6. Self-check section is ambiguous
- File: `design-shots/mini-new-client.png`
- Four yes/no questions ("Гражданин РУз?", etc.) each render with a single empty circle. The implicit affordance — "click circle to confirm yes" — isn't obvious to first-time users.
- Fix options (pick one):
  - Convert to a 2-state switch (`Switch` from shadcn) with "Да / Нет" labels, OR
  - Replace circle with a checkbox icon and add hint text: *"Отметьте, если ответ — Да"*.
- Backend already treats these as 4 booleans (`bool_*` fields per migration 0008), so swapping the UI control is purely a frontend change.

### 7. Stat block duplication on mini-app home
- File: `qa-shots/mini-app-home.png`
- Green hero card shows: Всего клиентов 6 / Сегодня 0 / За месяц 6.
- Immediately below in a white card: СЕГОДНЯ 0 / ЗА НЕДЕЛЮ 6.
- "Сегодня 0" is shown twice within ~150px of each other.
- Fix: drop the white stat card. Hero already covers it. Use that screen real estate for a tip or onboarding nudge when stats are mostly zero (see Finding #8).

### 8. Empty-state polish on home dashboard
- File: `qa-shots/mini-app-home.png`
- When most stats are 0 and funnel has all zeros, the page looks dead. The credit expert sees no momentum.
- Fix: when `totalClients === 0 || (today === 0 && weekly === 0)`, show a small motivational callout: *"Сделайте первый лид сегодня — нажмите ⚡"* pointing to the FAB.

### 9. Signature pad — clear button is too quiet
- File: `design-shots/mini-new-client.png`
- "Очистить" sits as plain link text at the bottom-right of the canvas. Easy to miss; doesn't look interactive on first scan.
- Fix: convert to `<Button variant="ghost" size="sm">` with the trash icon. Place above the canvas, right-aligned, so users can clear *before* the canvas if they're tapping in error. Also add brief microcopy under the canvas: *"Подпишитесь пальцем"* (RU) / *"Barmoq bilan imzolang"* (UZ).

### 10. New-client form is long with no save anchor
- File: `design-shots/mini-new-client.png`
- The form scrolls through 8+ sections with no sticky save button or progress indicator visible.
- Fix: add a sticky bottom action bar (similar to the admin Credit Policy page's floating save bar — that pattern works well, screenshot: `qa-shots/admin-credit-policy.png`). Show "Сохранить" + a small inline counter "Заполнено: 5/9".

### 11. Avatar colors are random
- File: `qa-shots/mini-app-home.png`
- Client list avatars use 5 different bg tints (purple, green, blue, green, green) with no semantic meaning.
- Low priority. If you change anything, hash the client UUID to one of ~6 brand-aligned tints (greens, dark navy, gray) so the same client always gets the same color. Random rainbow undermines the otherwise restrained palette.

### 12. Credit Policy form is dense — visual breathing room
- File: `qa-shots/admin-credit-policy.png`
- The first card "Покрытие и дисконты" packs 9 numeric inputs in a 2-column grid. With 8 sections × ~9 fields, scanning is heavy.
- Low priority. Consider an expandable accordion pattern: only the section being edited is open. Or, add a left-side mini-toc that scrolls to each section.

### 13. Header bilingual logo conflict (low priority — confirm intent)
- Admin sidebar shows "Minerva" wordmark; header shows "Ipak Yo'li Bank" PNG.
- Two brands visible at once may confuse new staff. Probably intentional (Minerva = the SaaS shell white-labeled for IPAK YO'LI). Confirm with stakeholders before changing.

---

## Tokens / typography sanity check

Based on the captured surfaces:
- **Primary green**: ~`#16a34a` (mini-app FAB, admin sidebar accent, save button) — consistent ✅
- **Dark sidebar green**: `#0d3d1a → #155d27` gradient (login.tsx confirms) — consistent ✅
- **Backgrounds**: white cards on `#f4f7f4`-ish gray-green, both apps ✅
- **Type scale**: looks like `text-3xl` headings, `text-sm`/`text-xs` for labels — readable, no obvious offenders.
- **Iconography**: Lucide React, consistent stroke weight ✅

Nothing structurally wrong with the design system. The audit findings are content/state/copy-level issues, not foundational ones.

---

## What I'd ship first (if I were Codex tomorrow)

1. Fix double-comma greeting (15 min)
2. Drop duplicate "ФИО" label (15 min — likely just remove a `<CardHeader>` block)
3. Funnel empty-state (45 min)
4. Investigate VRAPIDA login (must do — credibility risk)
5. Sticky save bar on new-client form (60-90 min)

That's a solid first day. The rest is incremental polish.

---

## Out of scope for this pass

- No accessibility audit (no axe-core run, no contrast measurements).
- No interaction testing (form validation behavior, error states, network failure paths).
- No mobile-vs-desktop comparison for admin (only desktop captured).
- The `Quick Lead` screen capture came back as a skeleton — surface not actually evaluated. Worth a focused look if Codex has bandwidth.
