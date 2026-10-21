# Subscription Monitoring

Platform Operations portal for tracking subscriptions, historical costs, renewals and payment
cards, with Google Chat alerts. Next.js (App Router) + TypeScript + Tailwind + Supabase.

> Status: **feature-complete (Phases 1–8)**: inventory, effective-dated cost history, exchange rates, payment methods, dashboard and attention queue, CSV reports, Google Chat alerts with a daily cron. See [docs/database.md](docs/database.md) and [docs/deployment.md](docs/deployment.md) (env vars, go-live checklist, runbook).

## Requirements

- Node.js 20.19+ (22 LTS recommended for Vercel), npm

## Local setup

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run dev                    # http://localhost:3000
```

Without `.env.local` the app still starts; `/login` shows "Supabase is not configured".

### Environment variables

See [.env.example](.env.example). `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CHAT_WEBHOOK_URL` and
`CRON_SECRET` are server-only and must never be prefixed with `NEXT_PUBLIC_`.

### Google SSO (Supabase)

1. Google Cloud Console → APIs & Services → Credentials → create an **OAuth client (Web)**.
   Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → **Google**: paste the client ID and secret.
3. Supabase → Authentication → URL Configuration: Site URL = your app URL; add
   `http://localhost:3000/**` and your Vercel URL to Redirect URLs.
4. Access is limited to `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN`, enforced server-side in
   `src/app/auth/callback/route.ts`.
5. For local development you can create a user under Authentication → Users and set
   `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true`. Keep it `false` in production.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run check` | lint + typecheck + tests |

Do not run `npm run build` while `npm run dev` is running; it corrupts `.next`.

## Structure

```
src/app/          routes (thin); (app)/ is the authenticated shell
src/components/   ui + layout components
src/lib/          env validation, Supabase clients, utilities
src/domain/       pure business logic (cost history, rates, renewals, cards, alert engine, CSV), no framework imports
src/data/         server-side queries (RLS applies)
src/lib/alerts/   alert cycle: evaluate, persist, deliver (the only service-role user)
supabase/         migrations
tests/            unit / integration tests
docs/             architecture notes
```

Next.js 16 note: `src/proxy.ts` replaces the old `middleware.ts` convention.
