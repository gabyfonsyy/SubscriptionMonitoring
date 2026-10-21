import { describe, expect, it } from "vitest";
import { buildAttentionQueue, upcomingRenewals, type AttentionSubscription } from "@/domain/attention";
import { breakdownByCurrency, monthlyTrend, summarize } from "@/domain/summary";
import { csvCell, toCsv } from "@/domain/csv";

const today = "2026-10-21";
const base: AttentionSubscription = {
  id: "1",
  name: "Datadog",
  status: "active",
  billing_frequency: "monthly",
  auto_renew: true,
  next_renewal_date: "2027-06-01",
  cancellation_notice_days: 30,
  expiration_date: null,
  owner_id: "u1",
  current_amount: "100",
  card_label: null,
  card_last_four: null,
  card_expiry_month: null,
  card_expiry_year: null,
  card_retired_at: null,
};
const q = (o: Partial<AttentionSubscription>) => buildAttentionQueue([{ ...base, ...o }], today);

describe("attention queue", () => {
  it("is empty for a healthy subscription", () => {
    expect(q({})).toEqual([]);
  });
  it("flags an overdue renewal as high", () => {
    expect(q({ next_renewal_date: "2026-10-01" })[0]).toMatchObject({ kind: "renewal_overdue", severity: "high" });
  });
  it("flags a closed cancellation window, but not when auto-renew is off", () => {
    expect(q({ next_renewal_date: "2026-11-05", cancellation_notice_days: 30 })[0].kind).toBe("notice_passed");
    expect(q({ next_renewal_date: "2026-11-05", cancellation_notice_days: 30, auto_renew: false }).map((i) => i.kind)).toEqual(["renewal_due_soon"]);
  });
  it("warns when the cancel-by deadline is within 14 days", () => {
    const [i] = q({ next_renewal_date: "2026-11-25", cancellation_notice_days: 30 });
    expect(i).toMatchObject({ kind: "notice_deadline_soon", severity: "high", date: "2026-10-26" });
  });
  it("flags renewals due within 30 days as medium", () => {
    expect(q({ next_renewal_date: "2026-11-10", cancellation_notice_days: null })[0]).toMatchObject({ kind: "renewal_due_soon", severity: "medium" });
  });
  it("reports missing data instead of guessing", () => {
    const kinds = q({ next_renewal_date: null, owner_id: null, current_amount: null }).map((i) => i.kind).sort();
    expect(kinds).toEqual(["no_owner", "no_price", "no_renewal_date"]);
  });
  it("does not demand a renewal date or price for one-time charges", () => {
    expect(q({ billing_frequency: "one_time", next_renewal_date: null, current_amount: null })).toEqual([]);
  });
  it("flags card problems for live subscriptions", () => {
    expect(q({ card_label: "Visa", card_last_four: "4242", card_retired_at: "2026-01-01T00:00:00Z" })[0].kind).toBe("card_retired");
    expect(q({ card_label: "Visa", card_last_four: "4242", card_expiry_month: 9, card_expiry_year: 2026 })[0].kind).toBe("card_expired");
    expect(q({ card_label: "Visa", card_last_four: "4242", card_expiry_month: 11, card_expiry_year: 2026 })[0]).toMatchObject({ kind: "card_expiring_soon", severity: "medium" });
  });
  it("ignores archived and expired subscriptions", () => {
    expect(q({ status: "archived", owner_id: null })).toEqual([]);
    expect(q({ status: "expired", owner_id: null })).toEqual([]);
  });
  it("sorts high before medium before low, then by date", () => {
    const out = buildAttentionQueue(
      [
        { ...base, id: "a", name: "A", owner_id: null },
        { ...base, id: "b", name: "B", next_renewal_date: "2026-10-01" },
        { ...base, id: "c", name: "C", next_renewal_date: null },
      ],
      today,
    );
    expect(out.map((i) => i.severity)).toEqual(["high", "medium", "low"]);
  });
});

describe("upcomingRenewals", () => {
  const subs = [
    { id: "1", name: "B", status: "active", next_renewal_date: "2026-12-01", cancellation_notice_days: 30, auto_renew: true },
    { id: "2", name: "A", status: "active", next_renewal_date: "2026-11-01", cancellation_notice_days: null, auto_renew: null },
    { id: "3", name: "Past", status: "active", next_renewal_date: "2026-10-01", cancellation_notice_days: null, auto_renew: null },
    { id: "4", name: "Far", status: "active", next_renewal_date: "2027-06-01", cancellation_notice_days: null, auto_renew: null },
    { id: "5", name: "Arch", status: "archived", next_renewal_date: "2026-11-02", cancellation_notice_days: null, auto_renew: null },
  ];
  it("lists only the next 90 days, soonest first, without archived", () => {
    const r = upcomingRenewals(subs, today);
    expect(r.map((x) => x.name)).toEqual(["A", "B"]);
    expect(r[1].noticeDeadline).toBe("2026-11-01");
  });
});

describe("summary", () => {
  const rows = [
    { status: "active", category: "saas", team_name: "SE", next_renewal_date: "2026-11-01", current_currency: "USD", current_normalized_monthly: "100" },
    { status: "active", category: "saas", team_name: "DBA", next_renewal_date: null, current_currency: "PHP", current_normalized_monthly: "5000" },
    { status: "archived", category: "saas", team_name: "SE", next_renewal_date: "2026-11-01", current_currency: "USD", current_normalized_monthly: "999" },
    { status: "active", category: "database", team_name: null, next_renewal_date: "2027-01-01", current_currency: "USD", current_normalized_monthly: null },
  ];
  it("totals live spend per currency without mixing, and excludes archived", () => {
    const s = summarize(rows, today);
    expect(s.activeCount).toBe(3);
    expect(s.monthly.get("USD")?.toFixed()).toBe("100");
    expect(s.monthly.get("PHP")?.toFixed()).toBe("5000");
    expect(s.annual.get("USD")?.toFixed()).toBe("1200");
    expect(s.renewals30).toBe(1);
  });
  it("breaks down by key per currency, largest first", () => {
    const b = breakdownByCurrency(rows, (r) => r.category);
    expect(b.get("USD")).toHaveLength(1);
    expect(b.get("USD")![0].label).toBe("saas");
    expect(b.get("PHP")![0].amount.toFixed()).toBe("5000");
  });
});

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });
  it("neutralises spreadsheet formulas but keeps plain numbers", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-5")).toBe("-5");
    expect(csvCell("+1 555")).toBe("'+1 555");
  });
  it("handles nulls and builds CRLF rows with a BOM", () => {
    expect(toCsv(["a", "b"], [["x", null]])).toBe("﻿a,b\r\nx,\r\n");
  });
});

describe("monthlyTrend", () => {
  const hist = (from: string, to: string | null, amount: string) => ({
    effective_from: from, effective_to: to, amount, currency: "USD", billing_frequency: "monthly" as const, normalized_monthly: amount,
  });
  const subs = [
    { archived_at: null, history: [hist("2026-01-01", "2026-07-31", "100"), hist("2026-08-01", null, "150")] },
    { archived_at: "2026-09-15T00:00:00Z", history: [hist("2026-01-01", null, "40")] },
  ];
  it("returns 12 months ending this month", () => {
    const t = monthlyTrend(subs, today);
    expect(t).toHaveLength(12);
    expect(t[0].month).toBe("2025-11-01");
    expect(t[11].month).toBe("2026-10-01");
  });
  it("uses the price in effect each month and counts archived subs only until archived", () => {
    const t = monthlyTrend(subs, today);
    const at = (m: string) => t.find((p) => p.month === m)!.totals.get("USD")?.toFixed();
    expect(at("2026-03-01")).toBe("140");
    expect(at("2026-08-01")).toBe("190");
    expect(at("2026-09-01")).toBe("150"); // archived mid-September, sampled at month end
    expect(at("2026-10-01")).toBe("150");
    expect(at("2025-12-01")).toBeUndefined();
  });
});
