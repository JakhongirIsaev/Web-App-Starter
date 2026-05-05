# Secret Rotation & Incident Response

Scope: api-server (`artifacts/api-server`), admin SPA (`artifacts/admin`), mini-app SPA (`artifacts/mini-app`), Postgres (Railway).

## Secret inventory

| Secret | Where it lives | Rotation cadence | Blast radius on leak |
|---|---|---|---|
| `DATABASE_URL` | Railway env, `.env` (dev) | 90 days or on suspected compromise | Full data read/write; user PII + calc history |
| `TELEGRAM_BOT_TOKEN` | Railway env | On compromise | Bot hijack: can receive all webhook events, post to channels the bot is in, read initData submissions |
| `SESSION_TTL_MS` | Railway env (optional) | N/A (not a secret) | — |
| `SIGNED_URL_SECRET` | Railway env | On compromise | Short-lived document image URLs can be forged; existing signed URLs expire within 5 min on their own |
| bcrypt user password hashes | `users.password_hash` column | User self-serve reset | Offline crack → login access |
| auth_sessions tokens | `auth_sessions.token_hash` (SHA-256 of bearer token) | Per-session TTL (30 days default) | Raw bearer tokens live only client-side; DB dump exposes hashes only |
| Object storage creds (if any) | Railway env (`PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR`) | On compromise | Uploaded document read/write |
| Railway project token | Railway dashboard (not in repo) | On ex-employee departure | Full deploy control |

## Rotation procedures

### `DATABASE_URL`
1. In Railway → Postgres service → connection → reset password.
2. Copy the new URL into the api-server service environment variables.
3. Redeploy api-server (Railway should do this automatically when env changes).
4. Confirm `/api/health` returns 200 from the new deployment.
5. Revoke all sessions (see incident response below) if the old URL may have leaked.

### `TELEGRAM_BOT_TOKEN`
1. Message `@BotFather` in Telegram: `/revoke`, choose the bot, confirm.
2. `@BotFather` returns a new token. Paste into Railway env `TELEGRAM_BOT_TOKEN`.
3. Redeploy api-server.
4. Verify `/auth/telegram` still accepts valid initData by signing in from the mini-app.
5. If the old token was public, consider whether any messages sent from it during the compromise window need to be recalled (BotFather has no server-side recall; posts stay up).

### Session token invalidation (bulk)
- Single user: `DELETE FROM auth_sessions WHERE user_id = $1;` (or call `deleteSessionsForUser(userId)` from a one-shot script).
- Everyone: `TRUNCATE auth_sessions;` — forces every active user to reauthenticate. Zero data loss, 30-day token cache rebuild.
- Expired sweep (should already run on a cron): `DELETE FROM auth_sessions WHERE expires_at < NOW();`

### User password reset
- Admin action: set `password_hash` to a fresh bcrypt hash via the admin UI, notify user out-of-band, require change on next login (not yet enforced in schema — tracked as future work).
- Mass reset: bcrypt re-hash all rows with a rotation column (`password_rotated_at`) and invalidate sessions (see above).

## Incident response checklist

Trigger: credential exposure suspected (public repo, shared screenshot, phishing, employee departure, Sentry/log leak).

**T+0 — Contain (target: < 10 min)**
- [ ] Rotate the suspected secret (see procedures above).
- [ ] Redeploy api-server.
- [ ] `TRUNCATE auth_sessions;` if session token leak is possible.
- [ ] Revoke Railway deploy tokens held by affected accounts.

**T+30m — Assess**
- [ ] Identify the window: when was the secret first accessible? Last valid? Use `git log` on the exposing commit, Slack share timestamps, or log access patterns.
- [ ] Pull access logs for that window (Railway logs: `railway logs --deployment <id>`) and look for anomalous request patterns:
  - Unknown IPs on `/api/auth/login` or `/api/auth/me`
  - Bulk GETs on `/api/clients` or `/api/mini-app/clients/*`
  - Data export endpoints (`/api/mini-app/clients/:id/export`, `/api/mini-app/clients/export-all`, `/api/mini-app/exports/auto-excel`)
- [ ] Check Postgres audit (if enabled) for out-of-pattern queries.

**T+2h — Notify**
- [ ] Internal: tell engineering + leadership with timeline and blast-radius assessment.
- [ ] Customers: if PII may have been accessed, comply with Uzbekistan personal data law (if applicable) and internal policy. Draft the message from the template in `docs/templates/breach-notification.md` (create if not present).
- [ ] Telegram bot users: if bot token leaked, post an acknowledgement in the bot's primary channel.

**T+24h — Remediate**
- [ ] If a secret was committed to git: **do not** just delete it in a new commit — the history still contains it. Use `git filter-repo` (or BFG) to rewrite history, then force-push. Revoke and rotate the secret regardless.
- [ ] Add a scan to prevent recurrence: consider pre-commit hook with `trufflehog` or `gitleaks`, or GitHub push-protection if migrated to GitHub.
- [ ] Update this document with anything learned.

**T+1wk — Review**
- [ ] Post-mortem meeting. Record root cause, timeline, detection gap, fix, prevention.
- [ ] File any engineering follow-ups as tickets, not as a separate doc.

## Prevention

- `.env` and `.env.*` are gitignored (see `/.gitignore`). `.env.example` files stay tracked and must not contain real values.
- Bearer tokens are only stored hashed (SHA-256) in `auth_sessions.token_hash`; a DB dump does not expose live sessions.
- Session TTL is 30 days default, overridable via `SESSION_TTL_MS`. Consider shortening for high-privilege roles (future work).
- Login brute-force: 10 attempts / 15 min per IP on `/api/auth/login` (see `src/routes/auth.ts`).
- CORS is origin-allowlisted in production (`ADMIN_URL` + `MINI_APP_URL` + optional `EXTRA_CORS_ORIGINS`). Unknown origins are rejected.
- Secrets never get logged: pino serializer in `src/app.ts` strips query strings from `req.url`; request bodies are not logged by default.

## Tooling references

- Railway CLI: `railway logs`, `railway variables`, `railway redeploy`
- Drizzle: `pnpm -F @workspace/db exec drizzle-kit push` (do not run against prod without a backup)
- DB shell: `psql "$DATABASE_URL"` from a trusted machine only
- Git history rewrite: https://github.com/newren/git-filter-repo
