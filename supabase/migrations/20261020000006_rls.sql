-- 0006: Row Level Security. Deny by default; explicit policies per role.
--   viewer  : read everything
--   editor  : + create/update business data, acknowledge/resolve alerts
--   admin   : + settings, alert rules, role management, exchange-rate corrections
-- The service-role key bypasses RLS and is used only by trusted server code (cron/notifications).

do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings', 'user_profiles', 'teams', 'products', 'payment_methods', 'subscriptions',
    'subscription_cost_history', 'subscription_documents', 'exchange_rates', 'alert_rules',
    'subscription_alerts', 'notification_deliveries', 'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Defense in depth: anonymous users get nothing; nobody can delete or truncate financial history.
revoke all on all tables in schema public from anon;
revoke delete, truncate on
  public.teams, public.products, public.payment_methods, public.subscriptions,
  public.subscription_cost_history, public.exchange_rates, public.subscription_alerts,
  public.notification_deliveries, public.user_profiles, public.alert_rules, public.app_settings
  from authenticated;
revoke insert, update, delete, truncate on public.audit_logs from authenticated;

-- Read access: any active user.
create policy teams_select on public.teams for select to authenticated using (public.can_view());
create policy products_select on public.products for select to authenticated using (public.can_view());
create policy payment_methods_select on public.payment_methods for select to authenticated using (public.can_view());
create policy subscriptions_select on public.subscriptions for select to authenticated using (public.can_view());
create policy cost_history_select on public.subscription_cost_history for select to authenticated using (public.can_view());
create policy documents_select on public.subscription_documents for select to authenticated using (public.can_view());
create policy exchange_rates_select on public.exchange_rates for select to authenticated using (public.can_view());
create policy alert_rules_select on public.alert_rules for select to authenticated using (public.can_view());
create policy alerts_select on public.subscription_alerts for select to authenticated using (public.can_view());
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.can_view());
create policy app_settings_select on public.app_settings for select to authenticated using (public.can_view());
create policy user_profiles_select on public.user_profiles for select to authenticated using (public.can_view());
-- Delivery logs can reveal integration problems: editors and admins only.
create policy deliveries_select on public.notification_deliveries for select to authenticated using (public.can_edit());

-- Write access: editors and admins.
create policy teams_insert on public.teams for insert to authenticated with check (public.can_edit());
create policy teams_update on public.teams for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy products_insert on public.products for insert to authenticated with check (public.can_edit());
create policy products_update on public.products for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy payment_methods_insert on public.payment_methods for insert to authenticated with check (public.can_edit());
create policy payment_methods_update on public.payment_methods for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy subscriptions_insert on public.subscriptions for insert to authenticated with check (public.can_edit());
create policy subscriptions_update on public.subscriptions for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy cost_history_insert on public.subscription_cost_history for insert to authenticated with check (public.can_edit());
create policy cost_history_update on public.subscription_cost_history for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy documents_insert on public.subscription_documents for insert to authenticated with check (public.can_edit());
create policy documents_update on public.subscription_documents for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy documents_delete on public.subscription_documents for delete to authenticated using (public.can_edit());
create policy exchange_rates_insert on public.exchange_rates for insert to authenticated with check (public.can_edit());
create policy alerts_update on public.subscription_alerts for update to authenticated using (public.can_edit()) with check (public.can_edit());

-- Admin-only.
create policy exchange_rates_update on public.exchange_rates for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy alert_rules_update on public.alert_rules for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy app_settings_insert on public.app_settings for insert to authenticated with check (public.is_admin());
create policy app_settings_update on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy user_profiles_update on public.user_profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Intentionally NO insert policy on subscription_alerts / notification_deliveries / user_profiles /
-- audit_logs for end users: those rows are created by trusted server code, triggers, or auth hooks.
