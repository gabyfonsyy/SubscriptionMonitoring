-- 0002: teams, products/services, payment methods.
-- Records are archived (archived_at / retired_at), never deleted, so history keeps its references.

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  description text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index teams_name_key on public.teams (lower(name));

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) > 0),
  description   text,
  owner_team_id uuid references public.teams (id),
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index products_name_key on public.products (lower(name));
create index products_owner_team_idx on public.products (owner_team_id);

-- SECURITY: only non-sensitive identifiers are stored. There is intentionally NO column for a
-- full card number, CVV, PIN, image or bank credential, and last_four is constrained to 4 digits.
-- Status "expiring soon"/"expired" is derived from expiry_month/expiry_year at read time.
create table public.payment_methods (
  id                  uuid primary key default gen_random_uuid(),
  label               text not null check (length(btrim(label)) > 0),
  last_four           text not null check (last_four ~ '^[0-9]{4}$'),
  expiry_month        smallint not null check (expiry_month between 1 and 12),
  expiry_year         smallint not null check (expiry_year between 2000 and 2100),
  responsible_team_id uuid references public.teams (id),
  cardholder_note     text check (length(cardholder_note) <= 200),
  notes               text,
  retired_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index payment_methods_team_idx on public.payment_methods (responsible_team_id);
create index payment_methods_expiry_idx on public.payment_methods (expiry_year, expiry_month);

create trigger teams_set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger payment_methods_set_updated_at before update on public.payment_methods
  for each row execute function public.set_updated_at();
