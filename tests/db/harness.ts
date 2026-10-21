import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

/** Minimal stand-in for the parts of Supabase our migrations rely on. */
const SUPABASE_STUB = `
  create schema if not exists auth;
  create schema if not exists extensions;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public, extensions, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export type Db = PGlite;

/** Fresh in-memory Postgres with every repository migration applied, in order. */
export async function createMigratedDb(): Promise<Db> {
  const db = new PGlite({ extensions: { btree_gist, pg_trgm } });
  await db.exec(SUPABASE_STUB);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

/** Creates an auth user (the signup trigger builds the profile) and sets the role. */
export async function createUser(
  db: Db,
  email: string,
  role: "admin" | "editor" | "viewer" = "viewer",
): Promise<string> {
  const res = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  const id = res.rows[0].id;
  await db.query("update public.user_profiles set role = $2 where id = $1", [id, role]);
  return id;
}

/** Runs `fn` as the given user with the `authenticated` role (RLS enforced). */
export async function asUser<T>(db: Db, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

export async function createSubscription(
  db: Db,
  overrides: { name?: string; vendor?: string; frequency?: string; cycle?: number | null } = {},
): Promise<string> {
  const frequency = overrides.frequency ?? "monthly";
  const cycle = overrides.cycle === undefined ? 1 : overrides.cycle;
  const res = await db.query<{ id: string }>(
    `insert into public.subscriptions (name, vendor, billing_frequency, cycle_months)
     values ($1, $2, $3, $4) returning id`,
    [overrides.name ?? "Datadog", overrides.vendor ?? "Datadog Inc", frequency, cycle],
  );
  return res.rows[0].id;
}
