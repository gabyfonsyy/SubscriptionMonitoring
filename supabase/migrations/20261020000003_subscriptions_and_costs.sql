-- 0003: subscriptions, effective-dated cost history, documents, exchange rates.

create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(btrim(name)) > 0),
  vendor                   text not null check (length(btrim(vendor)) > 0),
  description              text,
  business_purpose         text,
  product_id               uuid references public.products (id),
  responsible_team_id      uuid references public.teams (id),
  owner_id                 uuid references public.user_profiles (id),
  category                 text not null default 'other'
    check (category in ('infrastructure', 'monitoring', 'security', 'developer_tools', 'saas', 'database', 'other')),
  billing_frequency        text not null
    check (billing_frequency in ('monthly', 'quarterly', 'semi_annual', 'annual', 'multi_year', 'one_time', 'custom')),
  -- Months per billing cycle. NULL only for one_time. Fixed for monthly..annual; free for multi_year/custom.
  cycle_months             smallint,
  auto_renew               boolean,
  next_billing_date        date,
  next_renewal_date        date,
  start_date               date,
  expiration_date          date,
  cancellation_notice_days smallint check (cancellation_notice_days is null or cancellation_notice_days >= 0),
  payment_method_id        uuid references public.payment_methods (id),
  status                   text not null default 'active'
    check (status in ('active', 'pending', 'under_review', 'cancellation_requested', 'expired', 'archived')),
  cost_center              text,
  criticality              text check (criticality in ('critical', 'high', 'medium', 'low')),
  notes                    text,
  archived_at              timestamptz,
  created_by               uuid default auth.uid() references public.user_profiles (id),
  updated_by               uuid references public.user_profiles (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint subscriptions_cycle_matches_frequency check (
    coalesce(case billing_frequency
      when 'monthly' then cycle_months = 1
      when 'quarterly' then cycle_months = 3
      when 'semi_annual' then cycle_months = 6
      when 'annual' then cycle_months = 12
      when 'one_time' then cycle_months is null
      else cycle_months between 1 and 120
    end, false)
  ),
  constraint subscriptions_dates_ordered check (expiration_date is null or start_date is null or expiration_date >= start_date),
  constraint subscriptions_archive_consistent check ((status = 'archived') = (archived_at is not null))
);

create index subscriptions_status_idx on public.subscriptions (status);
create index subscriptions_renewal_idx on public.subscriptions (next_renewal_date) where archived_at is null;
create index subscriptions_billing_idx on public.subscriptions (next_billing_date) where archived_at is null;
create index subscriptions_expiration_idx on public.subscriptions (expiration_date) where archived_at is null;
create index subscriptions_product_idx on public.subscriptions (product_id);
create index subscriptions_team_idx on public.subscriptions (responsible_team_id);
create index subscriptions_owner_idx on public.subscriptions (owner_id);
create index subscriptions_payment_method_idx on public.subscriptions (payment_method_id);
create index subscriptions_name_trgm_idx on public.subscriptions using gin (name extensions.gin_trgm_ops);
create index subscriptions_vendor_trgm_idx on public.subscriptions using gin (vendor extensions.gin_trgm_ops);
-- Exact duplicate guard (same vendor + name + product among non-archived records).
-- "Potential" duplicates (similar names) are surfaced in the app, not blocked here.
create unique index subscriptions_no_exact_duplicate_idx on public.subscriptions
  (lower(btrim(vendor)), lower(btrim(name)), coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where archived_at is null;

create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Effective-dated price history. Price changes ADD a row; they never overwrite the previous amount.
-- effective_from  = date the price takes effect (may be in the future).
-- recorded_at     = when someone entered it. These are deliberately different.
create table public.subscription_cost_history (
  id                 uuid primary key default gen_random_uuid(),
  subscription_id    uuid not null references public.subscriptions (id),
  effective_from     date not null,
  effective_to       date,
  amount             numeric(14, 4) not null check (amount >= 0),
  currency           text not null check (currency ~ '^[A-Z]{3}$'),
  billing_frequency  text not null
    check (billing_frequency in ('monthly', 'quarterly', 'semi_annual', 'annual', 'multi_year', 'one_time', 'custom')),
  cycle_months       smallint,
  -- amount / cycle_months, NULL for one-time charges (never treated as recurring).
  normalized_monthly numeric(14, 4),
  change_type        text not null default 'other'
    check (change_type in ('initial', 'increase', 'decrease', 'plan_change', 'discount', 'correction', 'other')),
  reason             text,
  recorded_by        uuid default auth.uid() references public.user_profiles (id),
  recorded_at        timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint cost_period_ordered check (effective_to is null or effective_to >= effective_from),
  constraint cost_cycle_matches_frequency check (
    coalesce(case billing_frequency
      when 'monthly' then cycle_months = 1
      when 'quarterly' then cycle_months = 3
      when 'semi_annual' then cycle_months = 6
      when 'annual' then cycle_months = 12
      when 'one_time' then cycle_months is null
      else cycle_months between 1 and 120
    end, false)
  ),
  constraint cost_normalized_consistent check (
    (cycle_months is null and normalized_monthly is null)
    or (cycle_months is not null and normalized_monthly = round(amount / cycle_months, 4))
  ),
  -- Two price periods for the same subscription can never overlap (open-ended end = unbounded).
  constraint cost_history_no_overlap exclude using gist (
    subscription_id with =,
    daterange(effective_from, effective_to, '[]') with &&
  )
);

create index cost_history_subscription_idx on public.subscription_cost_history (subscription_id, effective_from desc);

create trigger cost_history_set_updated_at before update on public.subscription_cost_history
  for each row execute function public.set_updated_at();

-- Current price per subscription (as of today). Runs with the caller's RLS.
create view public.subscription_current_cost
with (security_invoker = true) as
select distinct on (subscription_id)
  subscription_id,
  id as cost_id,
  amount,
  currency,
  billing_frequency,
  cycle_months,
  normalized_monthly,
  effective_from,
  effective_to
from public.subscription_cost_history
where effective_from <= current_date
  and (effective_to is null or effective_to >= current_date)
order by subscription_id, effective_from desc;

-- Records a price change atomically: closes the open period the day before the new one starts,
-- then inserts the new period. Supports future-dated changes. RLS of the caller applies.
create or replace function public.record_cost_change(
  p_subscription_id   uuid,
  p_effective_from    date,
  p_amount            numeric,
  p_currency          text,
  p_billing_frequency text,
  p_cycle_months      smallint,
  p_reason            text default null,
  p_change_type       text default 'other'
)
returns public.subscription_cost_history
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.subscription_cost_history;
begin
  if exists (
    select 1 from public.subscription_cost_history
    where subscription_id = p_subscription_id and effective_from >= p_effective_from
  ) then
    raise exception 'A cost record already starts on or after %. Correct that record instead.', p_effective_from
      using errcode = '23P01';
  end if;

  update public.subscription_cost_history
     set effective_to = p_effective_from - 1
   where subscription_id = p_subscription_id
     and (effective_to is null or effective_to >= p_effective_from);

  insert into public.subscription_cost_history
    (subscription_id, effective_from, amount, currency, billing_frequency, cycle_months,
     normalized_monthly, change_type, reason)
  values
    (p_subscription_id, p_effective_from, p_amount, p_currency, p_billing_frequency, p_cycle_months,
     case when p_cycle_months is null then null else round(p_amount / p_cycle_months, 4) end,
     p_change_type, p_reason)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.record_cost_change(uuid, date, numeric, text, text, smallint, text, text)
  from public, anon;
grant execute on function public.record_cost_change(uuid, date, numeric, text, text, smallint, text, text)
  to authenticated, service_role;

create table public.subscription_documents (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id),
  title           text not null check (length(btrim(title)) > 0),
  url             text not null check (url ~* '^https?://'),
  created_by      uuid default auth.uid() references public.user_profiles (id),
  created_at      timestamptz not null default now()
);
create index subscription_documents_subscription_idx on public.subscription_documents (subscription_id);

-- Dated conversion rates: 1 base_currency = rate quote_currency, as of effective_date.
-- Reports use the latest rate on or before the date being reported; if none exists they must
-- show "no rate available" rather than guessing.
create table public.exchange_rates (
  id             uuid primary key default gen_random_uuid(),
  base_currency  text not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency text not null check (quote_currency ~ '^[A-Z]{3}$'),
  rate           numeric(18, 8) not null check (rate > 0),
  effective_date date not null,
  source         text,
  recorded_by    uuid default auth.uid() references public.user_profiles (id),
  recorded_at    timestamptz not null default now(),
  constraint exchange_rates_distinct_currencies check (base_currency <> quote_currency),
  constraint exchange_rates_unique_per_day unique (base_currency, quote_currency, effective_date)
);
create index exchange_rates_lookup_idx on public.exchange_rates (base_currency, quote_currency, effective_date desc);
