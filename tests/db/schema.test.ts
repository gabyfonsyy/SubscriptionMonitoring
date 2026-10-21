import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createSubscription, createUser, type Db } from "./harness";

let db: Db;
let admin: string;
let editor: string;
let viewer: string;
let outsider: string;

beforeAll(async () => {
  db = await createMigratedDb();
  admin = await createUser(db, "admin@sprout.ph", "admin");
  editor = await createUser(db, "editor@sprout.ph", "editor");
  viewer = await createUser(db, "viewer@sprout.ph", "viewer");
  outsider = await createUser(db, "someone@gmail.com", "editor"); // wrong domain => inactive
}, 60_000);

afterAll(async () => {
  await db.close();
});

const rejects = (p: Promise<unknown>, pattern: RegExp) => expect(p).rejects.toThrow(pattern);

describe("user profiles", () => {
  it("activates only e-mails on the allowed domain", async () => {
    const res = await db.query<{ email: string; is_active: boolean }>(
      "select email, is_active from public.user_profiles order by email",
    );
    const byEmail = Object.fromEntries(res.rows.map((r) => [r.email, r.is_active]));
    expect(byEmail["admin@sprout.ph"]).toBe(true);
    expect(byEmail["someone@gmail.com"]).toBe(false);
  });
});

describe("row level security", () => {
  it("lets a viewer read but not write", async () => {
    await createSubscription(db, { name: "Read Me", vendor: "V" });
    const rows = await asUser(db, viewer, () => db.query("select id from public.subscriptions"));
    expect(rows.rows.length).toBeGreaterThan(0);

    await rejects(
      asUser(db, viewer, () =>
        db.query(
          "insert into public.subscriptions (name, vendor, billing_frequency, cycle_months) values ('x','y','monthly',1)",
        ),
      ),
      /row-level security/,
    );
  });

  it("gives an inactive (off-domain) user no access at all", async () => {
    const rows = await asUser(db, outsider, () => db.query("select id from public.subscriptions"));
    expect(rows.rows).toHaveLength(0);
    await rejects(
      asUser(db, outsider, () =>
        db.query(
          "insert into public.subscriptions (name, vendor, billing_frequency, cycle_months) values ('o','o','monthly',1)",
        ),
      ),
      /row-level security/,
    );
  });

  it("lets an editor create and update, but never delete", async () => {
    const id = await asUser(db, editor, async () => {
      const r = await db.query<{ id: string }>(
        `insert into public.subscriptions (name, vendor, billing_frequency, cycle_months)
         values ('Editor Sub','EditorCo','monthly',1) returning id`,
      );
      return r.rows[0].id;
    });
    await asUser(db, editor, () =>
      db.query("update public.subscriptions set notes = 'ok' where id = $1", [id]),
    );
    await rejects(
      asUser(db, editor, () => db.query("delete from public.subscriptions where id = $1", [id])),
      /permission denied/,
    );
  });

  it("prevents anyone but an admin from changing roles or settings", async () => {
    for (const user of [viewer, editor]) {
      const res = await asUser(db, user, () =>
        db.query("update public.user_profiles set role = 'admin' where id = $1", [user]),
      );
      expect(res.affectedRows).toBe(0);
    }
    const settings = await asUser(db, editor, () =>
      db.query("update public.app_settings set value = '\"evil.com\"' where key = 'allowed_email_domain'"),
    );
    expect(settings.affectedRows).toBe(0);

    const ok = await asUser(db, admin, () =>
      db.query("update public.user_profiles set display_name = 'Viewer One' where id = $1", [viewer]),
    );
    expect(ok.affectedRows).toBe(1);
  });
});

describe("cost history", () => {
  const change = (
    subId: string,
    from: string,
    amount: number,
    freq = "monthly",
    cycle: number | null = 1,
  ) =>
    db.query(
      "select * from public.record_cost_change($1, $2::date, $3, 'USD', $4, $5::smallint, 'test', 'other')",
      [subId, from, amount, freq, cycle],
    );

  it("keeps every previous price when the price changes (200 -> 150 -> 175)", async () => {
    const sub = await createSubscription(db, { name: "Trend", vendor: "TrendCo" });
    await asUser(db, editor, async () => {
      await change(sub, "2026-09-01", 200);
      await change(sub, "2026-10-01", 150);
      await change(sub, "2026-11-01", 175); // later effective date than "today" is also fine
    });
    const res = await db.query<{
      amount: string;
      effective_from: Date;
      effective_to: Date | null;
      normalized_monthly: string;
    }>(
      `select amount::text, effective_from, effective_to, normalized_monthly::text
         from public.subscription_cost_history where subscription_id = $1 order by effective_from`,
      [sub],
    );
    expect(res.rows.map((r) => Number(r.amount))).toEqual([200, 150, 175]);
    const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    expect(res.rows.map((r) => iso(r.effective_to))).toEqual(["2026-09-30", "2026-10-31", null]);
  });

  it("supports future-dated changes without replacing the current price", async () => {
    const sub = await createSubscription(db, { name: "Future", vendor: "FutureCo" });
    await asUser(db, editor, async () => {
      await change(sub, "2020-01-01", 100);
      await change(sub, "2999-01-01", 500);
    });
    const res = await db.query<{ amount: string }>(
      "select amount::text from public.subscription_current_cost where subscription_id = $1",
      [sub],
    );
    expect(Number(res.rows[0].amount)).toBe(100);
  });

  it("refuses a change dated before an existing record (ambiguous history)", async () => {
    const sub = await createSubscription(db, { name: "Order", vendor: "OrderCo" });
    await asUser(db, editor, () => change(sub, "2026-05-01", 10));
    await rejects(
      asUser(db, editor, () => change(sub, "2026-04-01", 20)),
      /already starts on or after/,
    );
  });

  it("rejects overlapping periods inserted directly", async () => {
    const sub = await createSubscription(db, { name: "Overlap", vendor: "OverlapCo" });
    await db.query(
      `insert into public.subscription_cost_history
         (subscription_id, effective_from, effective_to, amount, currency, billing_frequency, cycle_months, normalized_monthly)
       values ($1, '2026-01-01', '2026-06-30', 10, 'USD', 'monthly', 1, 10)`,
      [sub],
    );
    await rejects(
      db.query(
        `insert into public.subscription_cost_history
           (subscription_id, effective_from, effective_to, amount, currency, billing_frequency, cycle_months, normalized_monthly)
         values ($1, '2026-06-30', null, 12, 'USD', 'monthly', 1, 12)`,
        [sub],
      ),
      /cost_history_no_overlap/,
    );
  });

  it("normalizes to a monthly cost with exact decimals", async () => {
    const sub = await createSubscription(db, { name: "Quarterly", vendor: "QCo", frequency: "quarterly", cycle: 3 });
    const res = await asUser(db, editor, () => change(sub, "2026-01-01", 600, "quarterly", 3));
    expect(String((res.rows[0] as { normalized_monthly: string }).normalized_monthly)).toBe("200.0000");
  });

  it("stores one-time charges without a monthly equivalent", async () => {
    const sub = await createSubscription(db, { name: "Setup", vendor: "SetupCo", frequency: "one_time", cycle: null });
    const res = await asUser(db, editor, () => change(sub, "2026-01-01", 999, "one_time", null));
    expect((res.rows[0] as { normalized_monthly: unknown }).normalized_monthly).toBeNull();
  });

  it("rejects bad money data", async () => {
    const sub = await createSubscription(db, { name: "Bad", vendor: "BadCo" });
    const insert = (amount: number, currency: string, freq: string, cycle: number | null, norm: number | null) =>
      db.query(
        `insert into public.subscription_cost_history
           (subscription_id, effective_from, amount, currency, billing_frequency, cycle_months, normalized_monthly)
         values ($1, '2026-01-01', $2, $3, $4, $5, $6)`,
        [sub, amount, currency, freq, cycle, norm],
      );
    await rejects(insert(-1, "USD", "monthly", 1, -1), /check constraint/);
    await rejects(insert(10, "usd", "monthly", 1, 10), /check constraint/);
    await rejects(insert(10, "USD", "monthly", 3, 3.3333), /cost_cycle_matches_frequency/);
    await rejects(insert(10, "USD", "monthly", 1, 9), /cost_normalized_consistent/);
  });

  it("never allows deleting cost history", async () => {
    const sub = await createSubscription(db, { name: "NoDelete", vendor: "NDCo" });
    await asUser(db, editor, () => change(sub, "2026-01-01", 10));
    await rejects(
      asUser(db, admin, () =>
        db.query("delete from public.subscription_cost_history where subscription_id = $1", [sub]),
      ),
      /permission denied/,
    );
  });
});

describe("payment methods", () => {
  const insert = (last4: string) =>
    db.query(
      "insert into public.payment_methods (label, last_four, expiry_month, expiry_year) values ('Corp', $1, 12, 2030)",
      [last4],
    );

  it("accepts exactly four digits only", async () => {
    await insert("4242");
    await rejects(insert("424242"), /check constraint/);
    await rejects(insert("42a2"), /check constraint/);
    await rejects(insert("4111111111111111"), /check constraint/);
  });

  it("has no column that could hold sensitive card data", async () => {
    const res = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'payment_methods'",
    );
    const names = res.rows.map((r) => r.column_name);
    for (const forbidden of ["card_number", "pan", "cvv", "cvc", "pin", "full_number", "card_image"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("validates the expiry month", async () => {
    await rejects(
      db.query("insert into public.payment_methods (label, last_four, expiry_month, expiry_year) values ('x','1234',13,2030)"),
      /check constraint/,
    );
  });
});

describe("subscriptions", () => {
  it("blocks exact duplicates until the original is archived", async () => {
    await createSubscription(db, { name: "Slack", vendor: "Salesforce" });
    await rejects(createSubscription(db, { name: " slack ", vendor: "SALESFORCE" }), /no_exact_duplicate/);
    await db.query(
      "update public.subscriptions set status = 'archived', archived_at = now() where lower(name) = 'slack'",
    );
    await createSubscription(db, { name: "Slack", vendor: "Salesforce" });
  });

  it("keeps cost history readable after a subscription is archived", async () => {
    const sub = await createSubscription(db, { name: "Archived", vendor: "ArchCo" });
    await asUser(db, editor, () =>
      db.query("select * from public.record_cost_change($1, '2026-01-01', 50, 'USD', 'monthly', 1::smallint)", [sub]),
    );
    await db.query("update public.subscriptions set status = 'archived', archived_at = now() where id = $1", [sub]);
    const rows = await asUser(db, viewer, () =>
      db.query("select id from public.subscription_cost_history where subscription_id = $1", [sub]),
    );
    expect(rows.rows).toHaveLength(1);
  });

  it("requires status and archived_at to agree", async () => {
    const sub = await createSubscription(db, { name: "Half", vendor: "HalfCo" });
    await rejects(
      db.query("update public.subscriptions set status = 'archived' where id = $1", [sub]),
      /subscriptions_archive_consistent/,
    );
  });
});

describe("audit log", () => {
  it("records the actor and before/after values for edits", async () => {
    const sub = await createSubscription(db, { name: "Audited", vendor: "AuditCo" });
    await asUser(db, editor, () =>
      db.query("update public.subscriptions set auto_renew = true where id = $1", [sub]),
    );
    const res = await db.query<{ actor_email: string; before_data: { auto_renew: boolean | null }; after_data: { auto_renew: boolean } }>(
      `select actor_email, before_data, after_data from public.audit_logs
        where entity_table = 'subscriptions' and entity_id = $1 and action = 'update'`,
      [sub],
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].actor_email).toBe("editor@sprout.ph");
    expect(res.rows[0].before_data.auto_renew).toBeNull();
    expect(res.rows[0].after_data.auto_renew).toBe(true);
  });

  it("is append-only and not writable by end users", async () => {
    await rejects(db.query("update public.audit_logs set action = 'x'"), /append-only/);
    await rejects(db.query("delete from public.audit_logs"), /append-only/);
    await rejects(
      asUser(db, admin, () =>
        db.query("insert into public.audit_logs (entity_table, action) values ('t','insert')"),
      ),
      /permission denied/,
    );
  });
});

describe("alerts and deliveries", () => {
  it("deduplicates the same business event", async () => {
    const sub = await createSubscription(db, { name: "Alerted", vendor: "AlertCo" });
    const insert = () =>
      db.query(
        `insert into public.subscription_alerts (subscription_id, alert_type, severity, title, dedupe_key)
         values ($1, 'renewal_approaching', 'warning', 'Renews soon', $2)
         on conflict (dedupe_key) do nothing`,
        [sub, `${sub}:renewal_approaching:2026-12-01:14`],
      );
    expect((await insert()).affectedRows).toBe(1);
    expect((await insert()).affectedRows).toBe(0);
  });

  it("records retries as extra attempts on the same alert", async () => {
    const sub = await createSubscription(db, { name: "Retry", vendor: "RetryCo" });
    const alert = await db.query<{ id: string }>(
      `insert into public.subscription_alerts (subscription_id, alert_type, severity, title, dedupe_key)
       values ($1, 'cost_increase', 'warning', 't', $2) returning id`,
      [sub, `${sub}:cost_increase`],
    );
    const id = alert.rows[0].id;
    const attempt = (n: number, status: string) =>
      db.query(
        "insert into public.notification_deliveries (alert_id, attempt, status) values ($1, $2, $3)",
        [id, n, status],
      );
    await attempt(1, "failed");
    await attempt(2, "sent");
    await rejects(attempt(2, "sent"), /notification_deliveries_attempt_key/);
  });

  it("hides delivery logs from viewers", async () => {
    const rows = await asUser(db, viewer, () => db.query("select id from public.notification_deliveries"));
    expect(rows.rows).toHaveLength(0);
  });
});

describe("exchange rates", () => {
  it("allows one rate per pair per day and admin-only corrections", async () => {
    const insert = () =>
      asUser(db, editor, () =>
        db.query(
          "insert into public.exchange_rates (base_currency, quote_currency, rate, effective_date) values ('USD','PHP',58.25,'2026-10-01')",
        ),
      );
    await insert();
    await rejects(insert(), /exchange_rates_unique_per_day/);

    const asEditor = await asUser(db, editor, () => db.query("update public.exchange_rates set rate = 1"));
    expect(asEditor.affectedRows).toBe(0);
    const asAdmin = await asUser(db, admin, () => db.query("update public.exchange_rates set rate = 58.5"));
    expect(asAdmin.affectedRows).toBe(1);
  });

  it("rejects a currency paired with itself and non-positive rates", async () => {
    await rejects(
      db.query("insert into public.exchange_rates (base_currency, quote_currency, rate, effective_date) values ('USD','USD',1,'2026-10-01')"),
      /check constraint/,
    );
    await rejects(
      db.query("insert into public.exchange_rates (base_currency, quote_currency, rate, effective_date) values ('USD','SGD',0,'2026-10-01')"),
      /check constraint/,
    );
  });
});

describe("create_subscription and inventory view", () => {
  it("creates the subscription and its first price atomically", async () => {
    const id = await asUser(db, editor, async () => {
      const r = await db.query<{ id: string }>(
        `select id from public.create_subscription(
           '{"name":"Atomic","vendor":"AtomicCo","billing_frequency":"annual","cycle_months":12}'::jsonb,
           2400, 'USD', '2020-01-01', 'initial')`,
      );
      return r.rows[0].id;
    });
    const inv = await asUser(db, viewer, () =>
      db.query<{ current_normalized_monthly: string; status: string }>(
        "select current_normalized_monthly::text, status from public.subscription_inventory where id = $1",
        [id],
      ),
    );
    expect(Number(inv.rows[0].current_normalized_monthly)).toBe(200);
    expect(inv.rows[0].status).toBe("active");
  });

  it("rolls everything back if the price is invalid", async () => {
    await rejects(
      asUser(db, editor, () =>
        db.query(
          `select * from public.create_subscription(
             '{"name":"Rollback","vendor":"RollbackCo","billing_frequency":"monthly","cycle_months":1}'::jsonb,
             10, 'usd')`,
        ),
      ),
      /check constraint/,
    );
    const left = await db.query("select 1 from public.subscriptions where name = 'Rollback'");
    expect(left.rows).toHaveLength(0);
  });

  it("denies creation to viewers", async () => {
    await rejects(
      asUser(db, viewer, () =>
        db.query(
          `select * from public.create_subscription('{"name":"V","vendor":"V","billing_frequency":"monthly","cycle_months":1}'::jsonb)`,
        ),
      ),
      /row-level security/,
    );
  });
});

describe("seed data", () => {
  it("loads cleanly on an empty database, then refuses to run twice", async () => {
    const seedDb = await createMigratedDb();
    const seed = (await import("node:fs")).readFileSync("supabase/seed.sql", "utf8");
    await seedDb.exec(seed);
    const count = await seedDb.query<{ n: number }>("select count(*)::int as n from public.subscriptions");
    expect(count.rows[0].n).toBe(5);
    await expect(seedDb.exec(seed)).rejects.toThrow(/Seed aborted/);
    await seedDb.close();
  });
});
