-- 0005: append-only audit log + triggers on every business table.

create table public.audit_logs (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  actor_email  text,
  entity_table text not null,
  entity_id    text,
  action       text not null,
  before_data  jsonb,
  after_data   jsonb
);
create index audit_logs_entity_idx on public.audit_logs (entity_table, entity_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);

-- Audit rows can never be changed or removed, even by privileged roles.
create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.audit_logs_immutable();

-- Records who changed what, with before/after values. Runs as definer so the caller needs no
-- direct write access to audit_logs. None of the audited tables hold secrets.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_old   jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new   jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and v_old - 'updated_at' = v_new - 'updated_at' then
    return null; -- no-op update
  end if;

  select email into v_email from public.user_profiles where id = v_actor;

  insert into public.audit_logs (actor_id, actor_email, entity_table, entity_id, action, before_data, after_data)
  values (
    v_actor,
    v_email,
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key', v_new ->> 'alert_type', v_old ->> 'alert_type'),
    lower(tg_op),
    v_old,
    v_new
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings', 'user_profiles', 'teams', 'products', 'payment_methods', 'subscriptions',
    'subscription_cost_history', 'subscription_documents', 'exchange_rates', 'alert_rules',
    'subscription_alerts'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end;
$$;
