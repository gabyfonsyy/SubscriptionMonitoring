import { describe, expect, it } from "vitest";
import {
  alertsToResolve,
  crossedInterval,
  evaluateAlerts,
  type EngineCard,
  type EngineRule,
  type EngineSubscription,
} from "@/domain/alert-engine";
import { buildChatMessage, chunk, isAuthorizedCron, sanitizeError } from "@/domain/notifications";

const today = "2026-10-21";
const rules: EngineRule[] = [
  { alert_type: "renewal_approaching", enabled: true, reminder_days: [30, 14, 7] },
  { alert_type: "cancellation_deadline", enabled: true, reminder_days: [30, 14, 7] },
  { alert_type: "subscription_expiring", enabled: true, reminder_days: [30, 14, 7] },
  { alert_type: "payment_card_expiring", enabled: true, reminder_days: [60, 30, 14] },
  { alert_type: "payment_card_expired", enabled: true, reminder_days: [] },
  { alert_type: "cost_increase", enabled: true, reminder_days: [] },
  { alert_type: "marked_for_review", enabled: true, reminder_days: [] },
  { alert_type: "missing_details", enabled: true, reminder_days: [] },
  { alert_type: "potential_duplicate", enabled: true, reminder_days: [] },
  { alert_type: "newly_registered", enabled: false, reminder_days: [] },
];

const sub = (o: Partial<EngineSubscription> = {}): EngineSubscription => ({
  id: "s1", name: "Datadog", vendor: "Datadog Inc", product_id: null, status: "active", billing_frequency: "monthly",
  auto_renew: true, next_renewal_date: "2027-06-01", cancellation_notice_days: null, expiration_date: null, owner_id: "u1",
  current_amount: "100", payment_method_id: null, created_at: "2026-01-01T00:00:00Z", archived_at: null, ...o,
});
const run = (subs: EngineSubscription[], extra: Partial<Parameters<typeof evaluateAlerts>[0]> = {}) =>
  evaluateAlerts({ subscriptions: subs, cards: [], costHistory: [], rules, today, ...extra });

describe("crossedInterval", () => {
  it("returns the tightest interval already crossed", () => {
    expect(crossedInterval(25, [30, 14, 7])).toBe(30);
    expect(crossedInterval(10, [30, 14, 7])).toBe(14);
    expect(crossedInterval(3, [30, 14, 7])).toBe(7);
    expect(crossedInterval(0, [30, 14, 7])).toBe(7);
  });
  it("is null when too far away, past, or no intervals", () => {
    expect(crossedInterval(31, [30, 14, 7])).toBeNull();
    expect(crossedInterval(-1, [30, 14, 7])).toBeNull();
    expect(crossedInterval(5, [])).toBeNull();
  });
});

describe("evaluateAlerts", () => {
  it("emits nothing for a healthy subscription", () => {
    expect(run([sub()])).toEqual([]);
  });
  it("sends ONE renewal alert for the tightest crossed interval, with a stable dedupe key", () => {
    const a = run([sub({ next_renewal_date: "2026-10-31" })]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ alert_type: "renewal_approaching", reminder_days: 14, severity: "warning", dedupe_key: "renewal_approaching:s1:2026-10-31:14" });
    expect(run([sub({ next_renewal_date: "2026-10-31" })])[0].dedupe_key).toBe(a[0].dedupe_key);
  });
  it("escalates to a new key as the date nears", () => {
    expect(run([sub({ next_renewal_date: "2026-10-26" })])[0]).toMatchObject({ reminder_days: 7, severity: "critical" });
  });
  it("alerts on the cancellation deadline, not when auto-renew is off", () => {
    const s = sub({ next_renewal_date: "2026-11-25", cancellation_notice_days: 30 });
    expect(run([s]).map((a) => a.alert_type)).toContain("cancellation_deadline");
    expect(run([{ ...s, auto_renew: false }]).map((a) => a.alert_type)).not.toContain("cancellation_deadline");
  });
  it("respects disabled rules", () => {
    const off = rules.map((r) => (r.alert_type === "renewal_approaching" ? { ...r, enabled: false } : r));
    expect(run([sub({ next_renewal_date: "2026-10-31" })], { rules: off })).toEqual([]);
  });
  it("ignores archived and expired subscriptions", () => {
    expect(run([sub({ status: "archived", next_renewal_date: "2026-10-31", owner_id: null })])).toEqual([]);
    expect(run([sub({ status: "expired", next_renewal_date: "2026-10-31" })])).toEqual([]);
  });
  it("flags missing details monthly and reviews", () => {
    const a = run([sub({ owner_id: null, current_amount: null, status: "under_review" })]);
    expect(a.map((x) => x.alert_type).sort()).toEqual(["marked_for_review", "missing_details"]);
    expect(a.find((x) => x.alert_type === "missing_details")!.dedupe_key).toBe("missing_details:s1:2026-10");
    expect(a.find((x) => x.alert_type === "missing_details")!.detail).toMatch(/owner, current price/);
  });
  it("only enables newly_registered when the rule is on", () => {
    const on = rules.map((r) => (r.alert_type === "newly_registered" ? { ...r, enabled: true } : r));
    expect(run([sub({ created_at: "2026-10-21T01:00:00Z" })], { rules: on }).map((a) => a.alert_type)).toEqual(["newly_registered"]);
    expect(run([sub({ created_at: "2026-10-21T01:00:00Z" })])).toEqual([]);
  });
  it("detects potential duplicates once per pair", () => {
    const a = run([sub({ id: "a", name: "Datadog APM" }), sub({ id: "b", name: "Datadog APM Pro" })]);
    expect(a.filter((x) => x.alert_type === "potential_duplicate")).toHaveLength(1);
  });
});

describe("card alerts", () => {
  const card = (o: Partial<EngineCard> = {}): EngineCard => ({ id: "c1", label: "Visa", last_four: "4242", expiry_month: 12, expiry_year: 2026, retired_at: null, ...o });
  const used = sub({ payment_method_id: "c1" });
  it("alerts when a used card nears expiry", () => {
    const a = run([used], { cards: [card({ expiry_month: 11 })] });
    expect(a[0]).toMatchObject({ alert_type: "payment_card_expiring", payment_method_id: "c1", due_date: "2026-11-30", reminder_days: 60 });
    expect(a[0].detail).toMatch(/Datadog/);
  });
  it("alerts critical when expired, once per expiry", () => {
    const a = run([used], { cards: [card({ expiry_month: 9 })] });
    expect(a[0]).toMatchObject({ alert_type: "payment_card_expired", severity: "critical", dedupe_key: "payment_card_expired:c1:2026-09-30" });
  });
  it("ignores unused or retired cards", () => {
    expect(run([sub()], { cards: [card({ expiry_month: 9 })] })).toEqual([]);
    expect(run([used], { cards: [card({ expiry_month: 9, retired_at: "2026-01-01T00:00:00Z" })] })).toEqual([]);
  });
});

describe("cost increase alert", () => {
  const row = (id: string, from: string, to: string | null, amt: string, ct: "initial" | "increase" | "decrease") => ({
    id, subscription_id: "s1", effective_from: from, effective_to: to, amount: amt, currency: "USD",
    billing_frequency: "monthly" as const, normalized_monthly: amt, change_type: ct,
  });
  it("announces a fresh increase once (keyed by the cost record)", () => {
    const h = [row("k1", "2026-01-01", "2026-10-14", "100", "initial"), row("k2", "2026-10-15", null, "120", "increase")];
    const a = run([sub()], { costHistory: h });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ alert_type: "cost_increase", dedupe_key: "cost_increase:k2", title: "Datadog cost increased 20%" });
  });
  it("ignores old increases, decreases and future-dated ones", () => {
    expect(run([sub()], { costHistory: [row("k1", "2026-01-01", "2026-08-31", "100", "initial"), row("k2", "2026-09-01", null, "120", "increase")] })).toEqual([]);
    expect(run([sub()], { costHistory: [row("k1", "2026-01-01", "2026-10-14", "100", "initial"), row("k2", "2026-10-15", null, "80", "decrease")] })).toEqual([]);
    expect(run([sub()], { costHistory: [row("k1", "2026-01-01", "2026-10-31", "100", "initial"), row("k2", "2026-11-01", null, "120", "increase")] })).toEqual([]);
  });
});

describe("alertsToResolve", () => {
  const open = [
    { id: "1", alert_type: "renewal_approaching" as const, subscription_id: "s1", payment_method_id: null, due_date: "2026-10-30" },
    { id: "2", alert_type: "renewal_approaching" as const, subscription_id: "s1", payment_method_id: null, due_date: "2026-10-01" },
    { id: "3", alert_type: "missing_details" as const, subscription_id: "gone", payment_method_id: null, due_date: null },
    { id: "4", alert_type: "payment_card_expired" as const, subscription_id: null, payment_method_id: "c1", due_date: "2026-09-30" },
    { id: "5", alert_type: "delivery_failure" as const, subscription_id: null, payment_method_id: null, due_date: null },
    { id: "6", alert_type: "cost_increase" as const, subscription_id: "s1", payment_method_id: null, due_date: "2026-10-15" },
  ];
  it("resolves stale ones and keeps live ones", () => {
    const ids = alertsToResolve(open, [{ id: "s1", status: "active" }], [{ id: "c1", retired_at: "2026-10-01T00:00:00Z" }], today);
    expect(ids.sort()).toEqual(["2", "3", "4"]);
  });
  it("keeps an expired-card alert while the card is still in use", () => {
    expect(alertsToResolve([open[3]], [], [{ id: "c1", retired_at: null }], today)).toEqual([]);
  });
  it("resolves when the subscription is archived", () => {
    expect(alertsToResolve([open[0]], [{ id: "s1", status: "archived" }], [], today)).toEqual(["1"]);
  });
});

describe("chat message", () => {
  const alerts = [
    { id: "1", title: "Info thing", detail: null, severity: "info" as const, subscription_id: "s2", payment_method_id: null },
    { id: "2", title: "Critical *bold* <b>", detail: "Renewal @all", severity: "critical" as const, subscription_id: "s1", payment_method_id: null },
  ];
  it("lists most severe first with portal links and strips formatting/mentions", () => {
    const { text } = buildChatMessage(alerts, "https://subs.example.com/");
    expect(text.indexOf("Critical")).toBeLessThan(text.indexOf("Info thing"));
    expect(text).toContain("https://subs.example.com/subscriptions/s1");
    expect(text).not.toMatch(/\*bold\*|<b>/);
    expect(text).not.toMatch(/@all/);
  });
  it("labels multi-part digests", () => {
    expect(buildChatMessage(alerts, "http://x", { index: 2, total: 3 }).text).toContain("(2/3)");
  });
  it("chunks lists", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("cron auth + error hygiene", () => {
  const secret = "s".repeat(32);
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCron(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCron("Bearer wrong", secret)).toBe(false);
    expect(isAuthorizedCron(null, secret)).toBe(false);
  });
  it("never authorizes when no secret is configured", () => {
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
  });
  it("removes URLs from stored errors", () => {
    expect(sanitizeError("fetch failed for https://chat.googleapis.com/v1/spaces/X/messages?key=SECRET now")).toBe("fetch failed for [url] now");
  });
});
