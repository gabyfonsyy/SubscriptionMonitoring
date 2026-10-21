-- SAMPLE DATA for local/dev use ONLY. Do not run against a production database.
-- Run manually in the Supabase SQL Editor. It refuses to run if subscriptions already exist,
-- so it cannot duplicate or pollute real data. All rows are tagged "[SAMPLE]" in notes.

do $$
declare
  t_platform uuid; t_data uuid; t_sec uuid;
  p_hr uuid; p_pay uuid; p_internal uuid;
  c_corp uuid; c_old uuid;
  s_monitor uuid; s_cloud uuid; s_sec uuid; s_ide uuid; s_setup uuid;
begin
  if exists (select 1 from public.subscriptions) then
    raise exception 'Seed aborted: subscriptions already contain data.';
  end if;

  insert into public.teams (name, description) values
    ('Platform Operations', '[SAMPLE]'), ('Data Engineering', '[SAMPLE]'), ('Security', '[SAMPLE]');
  select id into t_platform from public.teams where name = 'Platform Operations';
  select id into t_data from public.teams where name = 'Data Engineering';
  select id into t_sec from public.teams where name = 'Security';

  insert into public.products (name, description, owner_team_id) values
    ('Sprout HR', '[SAMPLE]', t_platform), ('Sprout Payroll', '[SAMPLE]', t_data), ('Internal Tooling', '[SAMPLE]', t_platform);
  select id into p_hr from public.products where name = 'Sprout HR';
  select id into p_pay from public.products where name = 'Sprout Payroll';
  select id into p_internal from public.products where name = 'Internal Tooling';

  insert into public.payment_methods (label, last_four, expiry_month, expiry_year, responsible_team_id, notes) values
    ('Corporate Visa', '4242', extract(month from current_date + 45)::int, extract(year from current_date + 45)::int, t_platform, '[SAMPLE] expires soon'),
    ('Old Mastercard', '1111', 1, 2024, t_platform, '[SAMPLE] already expired');
  select id into c_corp from public.payment_methods where last_four = '4242';
  select id into c_old from public.payment_methods where last_four = '1111';

  insert into public.subscriptions
    (name, vendor, business_purpose, product_id, responsible_team_id, category, billing_frequency, cycle_months,
     auto_renew, next_billing_date, next_renewal_date, start_date, cancellation_notice_days, payment_method_id,
     status, criticality, notes)
  values
    ('Application Monitoring', 'Datadog', 'APM and infrastructure metrics', p_hr, t_platform, 'monitoring', 'monthly', 1,
     true, current_date + 12, current_date + 12, current_date - 400, 30, c_corp, 'active', 'critical', '[SAMPLE]'),
    ('Cloud Hosting', 'Microsoft Azure', 'Container hosting', p_pay, t_platform, 'infrastructure', 'annual', 12,
     true, current_date + 75, current_date + 75, current_date - 290, 60, c_corp, 'active', 'critical', '[SAMPLE]'),
    ('Endpoint Protection', 'CrowdStrike', 'Endpoint security', null, t_sec, 'security', 'quarterly', 3,
     false, current_date + 20, current_date + 20, current_date - 70, 45, c_old, 'under_review', 'high', '[SAMPLE]'),
    ('IDE Licenses', 'JetBrains', 'Developer IDEs', p_internal, t_platform, 'developer_tools', 'annual', 12,
     true, current_date + 200, current_date + 200, current_date - 165, 30, c_corp, 'active', 'medium', '[SAMPLE]'),
    ('Migration Setup Fee', 'Acme Consulting', 'One-time onboarding', p_internal, t_platform, 'other', 'one_time', null,
     null, null, null, current_date - 30, null, null, 'active', 'low', '[SAMPLE]');

  select id into s_monitor from public.subscriptions where name = 'Application Monitoring';
  select id into s_cloud from public.subscriptions where name = 'Cloud Hosting';
  select id into s_sec from public.subscriptions where name = 'Endpoint Protection';
  select id into s_ide from public.subscriptions where name = 'IDE Licenses';
  select id into s_setup from public.subscriptions where name = 'Migration Setup Fee';

  -- Monitoring: 200 -> 150 -> 175 (the worked example from the spec; last change is future-dated).
  insert into public.subscription_cost_history
    (subscription_id, effective_from, effective_to, amount, currency, billing_frequency, cycle_months, normalized_monthly, change_type, reason) values
    (s_monitor, current_date - 120, current_date - 61, 200, 'USD', 'monthly', 1, 200, 'initial',  '[SAMPLE] initial plan'),
    (s_monitor, current_date - 60,  current_date + 29, 150, 'USD', 'monthly', 1, 150, 'decrease', '[SAMPLE] negotiated discount'),
    (s_monitor, current_date + 30,  null,              175, 'USD', 'monthly', 1, 175, 'increase', '[SAMPLE] announced price rise');
  insert into public.subscription_cost_history
    (subscription_id, effective_from, amount, currency, billing_frequency, cycle_months, normalized_monthly, change_type, reason) values
    (s_cloud, current_date - 290, 24000, 'PHP', 'annual',      12,   2000,    'initial', '[SAMPLE]'),
    (s_sec,   current_date - 70,  3600,  'USD', 'quarterly',   3,    1200,    'initial', '[SAMPLE]'),
    (s_ide,   current_date - 165, 600,   'USD', 'annual',      12,   50,      'initial', '[SAMPLE]'),
    (s_setup, current_date - 30,  2500,  'USD', 'one_time',    null, null,    'initial', '[SAMPLE] one-time, not recurring');
end;
$$;
