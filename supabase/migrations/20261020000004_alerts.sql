-- 0004: alert rules, alert instances, notification delivery attempts.

create table public.alert_rules (
  alert_type          text primary key
    check (alert_type in ('renewal_approaching', 'cancellation_deadline', 'subscription_expiring',
      'payment_card_expiring', 'payment_card_expired', 'cost_increase', 'marked_for_review',
      'missing_details', 'potential_duplicate', 'newly_registered', 'delivery_failure')),
  enabled             boolean not null default true,
  -- Days before the due date at which to alert (e.g. {30,14,7}). Empty = alert once when detected.
  reminder_days       integer[] not null default '{}',
  actionable          boolean not null default true,
  recurring_reminders boolean not null default false,
  updated_by          uuid references public.user_profiles (id),
  updated_at          timestamptz not null default now()
);

insert into public.alert_rules (alert_type, enabled, reminder_days, actionable, recurring_reminders) values
  ('renewal_approaching',   true,  '{30,14,7}', true,  false),
  ('cancellation_deadline', true,  '{30,14,7}', true,  false),
  ('subscription_expiring', true,  '{30,14,7}', true,  false),
  ('payment_card_expiring', true,  '{60,30,14}', true, false),
  ('payment_card_expired',  true,  '{}',        true,  false),
  ('cost_increase',         true,  '{}',        true,  false),
  ('marked_for_review',     true,  '{}',        true,  false),
  ('missing_details',       true,  '{}',        true,  false),
  ('potential_duplicate',   true,  '{}',        true,  false),
  ('newly_registered',      false, '{}',        false, false),
  ('delivery_failure',      true,  '{}',        true,  false)
on conflict (alert_type) do nothing;

create trigger alert_rules_set_updated_at before update on public.alert_rules
  for each row execute function public.set_updated_at();

-- One row per business event. dedupe_key makes re-evaluation (and retried cron runs) idempotent:
-- the same subscription + alert type + due date + reminder interval can only exist once.
create table public.subscription_alerts (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid references public.subscriptions (id),
  payment_method_id uuid references public.payment_methods (id),
  alert_type        text not null references public.alert_rules (alert_type),
  severity          text not null check (severity in ('info', 'warning', 'critical')),
  title             text not null,
  detail            text,
  due_date          date,
  reminder_days     integer,
  dedupe_key        text not null,
  status            text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  acknowledged_by   uuid references public.user_profiles (id),
  acknowledged_at   timestamptz,
  resolved_by       uuid references public.user_profiles (id),
  resolved_at       timestamptz,
  payload           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint subscription_alerts_dedupe_key_key unique (dedupe_key)
);
create index subscription_alerts_status_due_idx on public.subscription_alerts (status, due_date);
create index subscription_alerts_subscription_idx on public.subscription_alerts (subscription_id);
create index subscription_alerts_payment_method_idx on public.subscription_alerts (payment_method_id);

create trigger subscription_alerts_set_updated_at before update on public.subscription_alerts
  for each row execute function public.set_updated_at();

-- One row per delivery ATTEMPT. A retry adds an attempt for the same alert, so retrying never
-- creates a duplicate business event. error_message must be sanitized (no URLs/secrets).
create table public.notification_deliveries (
  id            uuid primary key default gen_random_uuid(),
  alert_id      uuid not null references public.subscription_alerts (id),
  channel       text not null default 'google_chat' check (channel in ('google_chat')),
  attempt       integer not null default 1 check (attempt >= 1),
  status        text not null check (status in ('sent', 'failed', 'skipped')),
  http_status   integer,
  error_message text check (length(error_message) <= 500),
  attempted_at  timestamptz not null default now(),
  constraint notification_deliveries_attempt_key unique (alert_id, channel, attempt)
);
create index notification_deliveries_status_idx on public.notification_deliveries (status, attempted_at desc);
