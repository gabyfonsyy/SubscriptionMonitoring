-- 0007: atomic subscription creation and a flat inventory view for filtering/sorting/paging.

-- Creates a subscription and (optionally) its first price in ONE transaction, so a failed price
-- insert can never leave a half-created subscription. RLS of the caller applies.
create or replace function public.create_subscription(
  p_subscription     jsonb,
  p_amount           numeric default null,
  p_currency         text default null,
  p_cost_effective_from date default null,
  p_reason           text default null
)
returns public.subscriptions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.subscriptions := jsonb_populate_record(null::public.subscriptions, p_subscription);
  r public.subscriptions;
begin
  insert into public.subscriptions (
    name, vendor, description, business_purpose, product_id, responsible_team_id, owner_id,
    category, billing_frequency, cycle_months, auto_renew, next_billing_date, next_renewal_date,
    start_date, expiration_date, cancellation_notice_days, payment_method_id, status,
    cost_center, criticality, notes, updated_by
  ) values (
    s.name, s.vendor, s.description, s.business_purpose, s.product_id, s.responsible_team_id, s.owner_id,
    coalesce(s.category, 'other'), s.billing_frequency, s.cycle_months, s.auto_renew, s.next_billing_date,
    s.next_renewal_date, s.start_date, s.expiration_date, s.cancellation_notice_days, s.payment_method_id,
    coalesce(s.status, 'active'), s.cost_center, s.criticality, s.notes, auth.uid()
  )
  returning * into r;

  if p_amount is not null then
    perform public.record_cost_change(
      r.id,
      coalesce(p_cost_effective_from, r.start_date, current_date),
      p_amount,
      p_currency,
      r.billing_frequency,
      r.cycle_months,
      p_reason,
      'initial'
    );
  end if;

  return r;
end;
$$;

revoke execute on function public.create_subscription(jsonb, numeric, text, date, text) from public, anon;
grant execute on function public.create_subscription(jsonb, numeric, text, date, text) to authenticated, service_role;

-- One flat row per subscription with names and today's price, so PostgREST can filter, sort
-- (e.g. by monthly cost) and paginate on the server. Runs with the caller's RLS.
create view public.subscription_inventory
with (security_invoker = true) as
select
  s.*,
  p.name              as product_name,
  t.name              as team_name,
  coalesce(o.display_name, o.email) as owner_name,
  pm.label            as card_label,
  pm.last_four        as card_last_four,
  pm.expiry_month     as card_expiry_month,
  pm.expiry_year      as card_expiry_year,
  pm.retired_at       as card_retired_at,
  c.amount            as current_amount,
  c.currency          as current_currency,
  c.billing_frequency as current_frequency,
  c.cycle_months      as current_cycle_months,
  c.normalized_monthly as current_normalized_monthly
from public.subscriptions s
left join public.products p on p.id = s.product_id
left join public.teams t on t.id = s.responsible_team_id
left join public.user_profiles o on o.id = s.owner_id
left join public.payment_methods pm on pm.id = s.payment_method_id
left join public.subscription_current_cost c on c.subscription_id = s.id;
