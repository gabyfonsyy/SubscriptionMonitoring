# Deployment and operations

Hosting: Vercel (app + daily cron). Data and auth: Supabase. Notifications: Google Chat webhook.

## 1. Supabase

1. Apply the migrations in `supabase/migrations/` in order (SQL Editor, or `npm run db:bundle` once for a **fresh** project). For an existing project paste only the new file; re-running old ones fails.
2. Authentication → Providers → **Google**: add the OAuth client ID and secret (see README, "Google SSO").
3. Authentication → URL Configuration: Site URL = the production URL; add it and `http://localhost:3000/**` to Redirect URLs.
4. Sign in once with a `sprout.ph` account, then promote yourself: `update public.user_profiles set role = 'admin' where email = '<you>';`. New users default to the lowest role.

## 2. Vercel environment variables

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase → Project Settings → API | public by design; protected by RLS |
| `NEXT_PUBLIC_APP_URL` | production URL | used for links in Chat messages |
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` | `sprout.ph` | enforced server-side at sign-in |
| `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` | **`false`** | dev-only convenience; must be off in production |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API (service_role) | server-only; bypasses RLS; used only by the alert job |
| `GOOGLE_CHAT_WEBHOOK_URL` | Chat space → Apps & integrations → Webhooks | secret |
| `CRON_SECRET` | random string, 16+ chars | Vercel sends it as `Authorization: Bearer …` on cron calls |

Never prefix a secret with `NEXT_PUBLIC_`. After changing variables, redeploy.

## 3. Cron

`vercel.json` runs `/api/cron/alerts` daily at 00:00 UTC (08:00 Manila). The route is idempotent: running it twice (retry, manual run) does not duplicate alerts or messages. Without `CRON_SECRET` it answers 503; with a wrong one, 401.

## 4. Go-live checklist

- [ ] `npm run check` and `npm run build` pass locally.
- [ ] All migrations applied; at least one admin exists.
- [ ] `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=false` in Vercel.
- [ ] Sign in with Google works for a `sprout.ph` account and is refused for others.
- [ ] Settings → Notifications shows all three items configured; "Send test message" arrives.
- [ ] Settings → "Run alert check now" reports sane numbers, and a second press sends nothing new.
- [ ] Add a few exchange rates if you will convert currencies (Settings).
- [ ] Vercel → Cron Jobs shows the job and a successful first run.

## 5. Runbook

| Symptom | Likely cause / fix |
|---|---|
| Login "succeeds" then bounces to `/login` on a corporate network | TLS interception (e.g. Cloudflare WARP). Node needs `--use-system-ca`; `npm run dev`/`start` already set it. Same for ad-hoc scripts: `node --use-system-ca`. |
| Pages 500 in dev after a build | `npm run build` corrupts `.next` while `next dev` runs. Stop node, delete `.next`, restart. |
| No Chat messages | Settings shows webhook "Not configured" (variable missing, redeploy), or the webhook was deleted (test message fails). Failed sends are retried on later runs, 3 attempts each; a "notifications are failing" alert is raised. |
| Same alert re-sent | It should not be: alerts are keyed per subscription + type + date + interval. If it happens, check `notification_deliveries` for that alert. |
| A price was entered wrongly | Subscription page → "Correct this record" (reason required; audited). For a genuine change, record a new price instead. |
| Archived subscription missing from reports | It is not: history and CSV exports include archived subscriptions; only the default inventory view hides them. |

## 6. Security notes

- Row-level security is the real access control (viewer / editor / admin); the UI only hides what you cannot do.
- The service-role key is used in exactly one place (`src/lib/alerts/run.ts`), reached only from the cron route and admin-only settings actions.
- Cards: only nickname, last four and expiry are stored; full numbers and security codes are rejected in every free-text field.
- CSV exports neutralise spreadsheet formulas. Responses carry security headers (`X-Frame-Options`, `nosniff`, HSTS, referrer and permissions policies). A per-request, nonce-based Content-Security-Policy is set in `src/proxy.ts` (built in `src/lib/csp.ts`): scripts only from this origin or carrying the request's nonce, API connections only to Supabase, no framing, no plugins. Styles allow `unsafe-inline` because Recharts and Next set inline style attributes. If a policy ever blocks something legitimate, set `CSP_REPORT_ONLY=true` in Vercel and redeploy: violations are then logged in the browser console instead of blocked, while you fix the policy.
- Audit: every insert/update/delete on business tables is written to `audit_logs`.
