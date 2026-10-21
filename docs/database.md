# Database

Postgres on Supabase. Migrations live in `supabase/migrations/` and are the single source of truth.

## Applying migrations to a new environment

**Option A: SQL Editor (no CLI needed)**
1. `npm run db:bundle` writes `supabase/bundle.sql` (generated, git-ignored).
2. Supabase dashboard → SQL Editor → New query → paste the file → Run. It is not re-runnable;
   apply it once per empty project.

**Option B: Supabase CLI**: `npx supabase link --project-ref <ref>` then `npx supabase db push`.

Optional sample data (dev only; refuses to run if data exists): paste `supabase/seed.sql`.

## First admin
New sign-ups become `viewer`. Promote the first admin once in the SQL Editor:

```sql
update public.user_profiles set role = 'admin' where email = 'you@sprout.ph';
```
After that, admins manage roles from Settings (Phase 4+).

## Entities
| Table | Purpose |
|---|---|
| `user_profiles` | One per auth user; `role` (admin/editor/viewer) and `is_active` (true only for the allowed e-mail domain). |
| `app_settings` | Non-secret settings (allowed domain). Never put webhooks or keys here. |
| `teams`, `products` | Owners and what uses a subscription. Archived, never deleted. |
| `payment_methods` | Nickname, last four digits, expiry only. No other card data can be stored. |
| `subscriptions` | The inventory. Holds no price; price comes from cost history. |
| `subscription_cost_history` | Effective-dated prices. Overlaps are impossible (exclusion constraint). |
| `subscription_current_cost` (view) | Price effective today, honouring the caller's RLS. |
| `record_cost_change()` | Atomic price change: closes the open period, inserts the new one. |
| `exchange_rates` | Dated rates; reports use the latest rate on or before the reported date. |
| `alert_rules`, `subscription_alerts`, `notification_deliveries` | Alert config, deduplicated events (`dedupe_key`), per-attempt delivery log. |
| `audit_logs` | Append-only before/after history written by triggers. |

## Security model
- RLS is enabled on every table. Viewer = read; editor = + write business data and acknowledge
  alerts; admin = + settings, rules, roles, rate corrections. Delivery logs: editor/admin only.
- No end-user policy exists for DELETE on financial or audit data; `DELETE`/`TRUNCATE` are also revoked.
- `audit_logs` rejects UPDATE/DELETE/TRUNCATE for every role, including the service role.
- Off-domain sign-ups get a profile with `is_active = false`, which grants no access.
- The service-role key bypasses RLS: use it only in server code (`src/lib/supabase/admin.ts`).

## Tests
`npm test` runs `tests/db/*` against an in-memory Postgres (PGlite) with every migration applied
and a small Supabase stub (`auth.users`, `auth.uid()`, roles). It never touches your Supabase project.
