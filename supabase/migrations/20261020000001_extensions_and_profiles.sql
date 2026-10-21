-- 0001: extensions, settings, user profiles, role helpers.
-- Roles: admin (everything + settings), editor (manage data), viewer (read-only).

create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Generic updated_at maintenance.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Non-secret application settings. NEVER store webhook URLs, keys or tokens here.
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('allowed_email_domain', '"sprout.ph"')
on conflict (key) do nothing;

create table public.user_profiles (
  id           uuid primary key references auth.users (id),
  email        text not null,
  display_name text,
  role         text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  is_active    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index user_profiles_email_key on public.user_profiles (lower(email));

create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- True when the e-mail is on the configured company domain.
create or replace function public.email_domain_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    lower(p_email) like '%@' || lower((select value #>> '{}' from public.app_settings where key = 'allowed_email_domain')),
    false
  );
$$;

-- Role helpers. SECURITY DEFINER so RLS policies can call them without recursion.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.user_profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_app_role() = 'admin', false); $$;

create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_app_role() in ('admin', 'editor'), false); $$;

create or replace function public.can_view()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.current_app_role() is not null; $$;

-- Every new auth user gets a profile: viewer, active only if on the allowed domain.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, email, display_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'viewer',
    public.email_domain_allowed(new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill users that signed up before this migration.
insert into public.user_profiles (id, email, display_name, role, is_active)
select u.id, u.email, split_part(u.email, '@', 1), 'viewer', public.email_domain_allowed(u.email)
from auth.users u
on conflict (id) do nothing;

revoke execute on function public.current_app_role(), public.is_admin(), public.can_edit(),
  public.can_view(), public.email_domain_allowed(text) from public, anon;
grant execute on function public.current_app_role(), public.is_admin(), public.can_edit(),
  public.can_view(), public.email_domain_allowed(text) to authenticated, service_role;
