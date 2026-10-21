import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { breakdownByCurrency, monthOverMonth, recentPriceChanges } from "@/domain/summary";

const today = "2026-10-21";

describe("monthOverMonth", () => {
  it("compares the last two months per currency", () => {
    const d = monthOverMonth([
      { month: "2026-09-01", totals: new Map([["USD", new Decimal("100")], ["PHP", new Decimal("0")]]) },
      { month: "2026-10-01", totals: new Map([["USD", new Decimal("110")], ["PHP", new Decimal("500")]]) },
    ]);
    expect(d.find((x) => x.currency === "USD")!.percent!.toFixed()).toBe("10");
    expect(d.find((x) => x.currency === "PHP")!.percent).toBeNull();
  });
  it("is empty with fewer than two months", () => {
    expect(monthOverMonth([])).toEqual([]);
  });
});

describe("recentPriceChanges", () => {
  const h = (from: string, to: string | null, amt: string, ct: "initial" | "increase" | "decrease") => ({
    effective_from: from, effective_to: to, amount: amt, currency: "USD", billing_frequency: "monthly" as const, normalized_monthly: amt, change_type: ct,
  });
  const subs = [
    { id: "a", name: "A", archived_at: null, history: [h("2026-01-01", "2026-09-30", "100", "initial"), h("2026-10-01", "2026-11-30", "120", "increase"), h("2026-12-01", null, "90", "decrease")] },
    { id: "b", name: "B", archived_at: "2026-10-01T00:00:00Z", history: [h("2026-01-01", "2026-09-30", "1", "initial"), h("2026-10-01", null, "2", "increase")] },
    { id: "c", name: "C", archived_at: null, history: [h("2025-01-01", "2025-05-31", "5", "initial"), h("2025-06-01", null, "6", "increase")] },
  ];
  it("lists recent and scheduled changes, newest first, skipping archived and old ones", () => {
    const r = recentPriceChanges(subs, today);
    expect(r.map((x) => `${x.name}:${x.effectiveFrom}:${x.scheduled}`)).toEqual(["A:2026-12-01:true", "A:2026-10-01:false"]);
    expect(r[1].percent).toBe("20");
  });
});

describe("breakdownByCurrency with links", () => {
  const rows = [
    { status: "active", category: "saas", team_name: "SE", next_renewal_date: null, current_currency: "USD", current_normalized_monthly: "10", pid: "p1", product: "Hub" },
    { status: "active", category: "saas", team_name: "SE", next_renewal_date: null, current_currency: "USD", current_normalized_monthly: "5", pid: "p1", product: "Hub" },
  ];
  it("keeps the href for each label and sums per label", () => {
    const b = breakdownByCurrency(rows, (r) => ({ label: r.product, href: `/subscriptions?product=${r.pid}` }));
    expect(b.get("USD")).toEqual([expect.objectContaining({ label: "Hub", href: "/subscriptions?product=p1" })]);
    expect(b.get("USD")![0].amount.toFixed()).toBe("15");
  });
});
