import { describe, expect, it } from "vitest";
import { parseSubscriptionForm } from "@/domain/subscription-schema";

const base = { name: "Datadog", vendor: "Datadog Inc", billing_frequency: "monthly" };

describe("parseSubscriptionForm", () => {
  it("accepts a minimal subscription and turns blanks into nulls", () => {
    const r = parseSubscriptionForm({ ...base, description: "  ", notes: "" }, { withCost: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subscription.description).toBeNull();
      expect(r.subscription.cycle_months).toBe(1);
      expect(r.subscription.category).toBe("other");
      expect(r.cost).toBeNull();
    }
  });

  it("requires name, vendor and frequency", () => {
    const r = parseSubscriptionForm({}, { withCost: false });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(["name", "vendor", "billing_frequency"]));
    }
  });

  it("requires a cycle length for custom billing and none for one-time", () => {
    expect(parseSubscriptionForm({ ...base, billing_frequency: "custom" }, { withCost: false }).ok).toBe(false);
    const ok = parseSubscriptionForm({ ...base, billing_frequency: "one_time" }, { withCost: false });
    expect(ok.ok && ok.subscription.cycle_months).toBe(null);
  });

  it("validates the initial price and currency together", () => {
    const r = parseSubscriptionForm({ ...base, amount: "200" }, { withCost: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.currency).toBeDefined();

    const good = parseSubscriptionForm({ ...base, amount: "1200.50", currency: "php" }, { withCost: true });
    expect(good.ok && good.cost).toEqual({ amount: "1200.5", currency: "PHP", effective_from: null, reason: null });
  });

  it("rejects negative, non-numeric and over-precise amounts", () => {
    for (const amount of ["-5", "abc", "1.23456"]) {
      expect(parseSubscriptionForm({ ...base, amount, currency: "USD" }, { withCost: true }).ok).toBe(false);
    }
  });

  it("rejects bad dates and expiry before start", () => {
    expect(parseSubscriptionForm({ ...base, next_renewal_date: "2026-02-30" }, { withCost: false }).ok).toBe(false);
    const r = parseSubscriptionForm(
      { ...base, start_date: "2026-05-01", expiration_date: "2026-04-01" },
      { withCost: false },
    );
    expect(r.ok).toBe(false);
  });

  it("does not allow setting status to archived through the form", () => {
    expect(parseSubscriptionForm({ ...base, status: "archived" }, { withCost: false }).ok).toBe(false);
  });

  it("maps auto-renew yes/no/unknown", () => {
    const get = (v: string) => {
      const r = parseSubscriptionForm({ ...base, auto_renew: v }, { withCost: false });
      return r.ok ? r.subscription.auto_renew : "err";
    };
    expect([get("yes"), get("no"), get("")]).toEqual([true, false, null]);
  });
});
