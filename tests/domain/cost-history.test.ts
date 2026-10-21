import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  convertSeries,
  convertTotals,
  monthlySeries,
  parseCorrection,
  parsePriceChange,
  priceAt,
  priceChanges,
  spendByCurrency,
  validateNewPeriodStart,
  type CostPeriod,
} from "@/domain/cost-history";
import { convert, parseRate, parseRatesCsv, type Rate } from "@/domain/exchange-rates";

const p = (from: string, to: string | null, amount: string, extra: Partial<CostPeriod> = {}): CostPeriod => ({
  effective_from: from,
  effective_to: to,
  amount,
  currency: "USD",
  billing_frequency: "monthly",
  normalized_monthly: amount,
  ...extra,
});

const history = [
  p("2026-01-01", "2026-03-31", "100"),
  p("2026-04-01", "2026-09-30", "120", { change_type: "increase" }),
  p("2026-10-01", null, "90", { change_type: "discount" }),
];

describe("priceAt", () => {
  it("selects the period in effect on a date (inclusive bounds)", () => {
    expect(priceAt(history, "2026-01-01")?.amount).toBe("100");
    expect(priceAt(history, "2026-03-31")?.amount).toBe("100");
    expect(priceAt(history, "2026-04-01")?.amount).toBe("120");
    expect(priceAt(history, "2027-06-01")?.amount).toBe("90");
  });
  it("returns null before the first record", () => {
    expect(priceAt(history, "2025-12-31")).toBeNull();
  });
  it("does not use a future-dated price today", () => {
    const h = [p("2026-01-01", "2026-10-31", "100"), p("2026-11-01", null, "150")];
    expect(priceAt(h, "2026-10-21")?.amount).toBe("100");
    expect(priceAt(h, "2026-11-01")?.amount).toBe("150");
  });
});

describe("monthlySeries", () => {
  it("picks the price by effective date for each month", () => {
    const s = monthlySeries(history, "2026-10-21");
    expect(s[0].month).toBe("2026-01-01");
    expect(s.find((x) => x.month === "2026-03-01")?.amount).toBe("100");
    expect(s.find((x) => x.month === "2026-04-01")?.amount).toBe("120");
    expect(s.find((x) => x.month === "2026-10-01")?.amount).toBe("90");
    expect(s[s.length - 1].month).toBe("2026-10-01");
  });
  it("extends to a future-dated change and flags it as scheduled", () => {
    const h = [p("2026-01-01", "2026-11-30", "100"), p("2026-12-01", null, "150")];
    const s = monthlySeries(h, "2026-10-21");
    expect(s[s.length - 1]).toMatchObject({ month: "2026-12-01", amount: "150", scheduled: true });
    expect(s.find((x) => x.month === "2026-10-01")).toMatchObject({ amount: "100", scheduled: false });
  });
  it("yields null for one-time charges", () => {
    const h = [p("2026-10-01", null, "500", { billing_frequency: "one_time", normalized_monthly: null })];
    expect(monthlySeries(h, "2026-10-21")[0].amount).toBeNull();
  });
  it("is empty without history", () => {
    expect(monthlySeries([], "2026-10-21")).toEqual([]);
  });
});

describe("priceChanges", () => {
  it("computes absolute and percent change vs the previous period", () => {
    const c = priceChanges(history);
    expect(c.get("2026-04-01")).toMatchObject({ absolute: "20", percent: "20", annotation: "increase" });
    expect(c.get("2026-10-01")).toMatchObject({ absolute: "-30", percent: "-25", annotation: "discount" });
    expect(c.has("2026-01-01")).toBe(false);
  });
  it("never compares across currencies", () => {
    const h = [p("2026-01-01", "2026-05-31", "100"), p("2026-06-01", null, "5000", { currency: "PHP" })];
    expect(priceChanges(h).get("2026-06-01")).toEqual({ note: "Currency changed USD → PHP." });
  });
  it("uses exact decimals and handles a zero previous amount", () => {
    const h = [p("2026-01-01", "2026-01-31", "0"), p("2026-02-01", null, "10")];
    expect(priceChanges(h).get("2026-02-01")).toMatchObject({ absolute: "10", percent: null });
    const h2 = [p("2026-01-01", "2026-01-31", "0.1"), p("2026-02-01", null, "0.3")];
    expect(priceChanges(h2).get("2026-02-01")).toMatchObject({ absolute: "0.2" });
  });
});

describe("validateNewPeriodStart", () => {
  it("rejects a date on or before the latest existing start", () => {
    expect(validateNewPeriodStart(history, "2026-10-01")).toMatch(/already starts/);
    expect(validateNewPeriodStart(history, "2026-05-01")).toMatch(/already starts/);
  });
  it("allows later (including future) dates", () => {
    expect(validateNewPeriodStart(history, "2026-10-02")).toBeNull();
    expect(validateNewPeriodStart(history, "2027-01-01")).toBeNull();
    expect(validateNewPeriodStart([], "2026-01-01")).toBeNull();
  });
});

describe("parsePriceChange", () => {
  const ok = { effective_from: "2026-11-01", amount: "150", currency: "usd", billing_frequency: "monthly", change_type: "increase" };
  it("accepts a future-dated change and uppercases currency", () => {
    const r = parsePriceChange(ok, history);
    expect(r.ok && r.value).toMatchObject({ currency: "USD", cycle_months: 1, effective_from: "2026-11-01" });
  });
  it("rejects bad input", () => {
    const r = parsePriceChange({ ...ok, amount: "-1", currency: "US", change_type: "initial", effective_from: "2026-02-30" }, history);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["amount", "change_type", "currency", "effective_from"]);
  });
  it("requires a cycle length for custom frequencies", () => {
    expect(parsePriceChange({ ...ok, billing_frequency: "custom" }, history).ok).toBe(false);
    expect(parsePriceChange({ ...ok, billing_frequency: "custom", cycle_months: "18" }, history).ok).toBe(true);
  });
  it("rejects an overlapping start", () => {
    const r = parsePriceChange({ ...ok, effective_from: "2026-06-01" }, history);
    expect(r.ok).toBe(false);
  });
});

describe("parseCorrection", () => {
  it("requires a reason and recomputes the monthly amount", () => {
    expect(parseCorrection({ amount: "1200", currency: "USD", billing_frequency: "annual" }).ok).toBe(false);
    const r = parseCorrection({ amount: "1200", currency: "USD", billing_frequency: "annual", reason: "Typo" });
    expect(r.ok && r.value.normalized_monthly).toBe("100");
  });
  it("stores null monthly for one-time", () => {
    const r = parseCorrection({ amount: "50", currency: "USD", billing_frequency: "one_time", reason: "x" });
    expect(r.ok && r.value.normalized_monthly).toBeNull();
  });
});

const rates: Rate[] = [
  { base_currency: "USD", quote_currency: "PHP", rate: "55", effective_date: "2026-01-01", source: "BSP" },
  { base_currency: "USD", quote_currency: "PHP", rate: "58", effective_date: "2026-06-01", source: "BSP" },
];

describe("convert", () => {
  it("uses the latest rate on or before the date, never a later one", () => {
    const a = convert("10", "USD", "PHP", "2026-05-31", rates);
    expect(a.ok && a.amount.toFixed()).toBe("550");
    const b = convert("10", "USD", "PHP", "2026-06-01", rates);
    expect(b.ok && b.amount.toFixed()).toBe("580");
  });
  it("says no rate is available before the first rate", () => {
    const r = convert("10", "USD", "PHP", "2025-12-31", rates);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.reason).toMatch(/No rate available/);
  });
  it("never guesses a missing pair", () => {
    expect(convert("10", "USD", "EUR", "2026-10-01", rates).ok).toBe(false);
  });
  it("inverts the opposite pair, and same-currency is identity", () => {
    const r = convert("580", "PHP", "USD", "2026-10-01", rates);
    expect(r.ok && r.inverted).toBe(true);
    expect(r.ok && r.amount.toDecimalPlaces(2).toFixed()).toBe("10");
    const same = convert("7", "USD", "USD", "2026-10-01", []);
    expect(same.ok && same.amount.toFixed()).toBe("7");
  });
  it("labels the rate date and source used", () => {
    const r = convert("1", "USD", "PHP", "2026-10-01", rates);
    expect(r.ok && r.rateDate).toBe("2026-06-01");
    expect(r.ok && r.source).toBe("BSP");
  });
});

describe("convertSeries", () => {
  it("leaves gaps with a reason instead of guessing", () => {
    const pts = monthlySeries([p("2025-12-01", null, "10")], "2026-02-10");
    const out = convertSeries(pts, "PHP", rates);
    expect(out[0].converted).toBeNull();
    expect(out[0].note).toMatch(/No rate available/);
    expect(out[1].converted).toBe("550");
  });
});

describe("spend totals", () => {
  const subs = [
    { history: [p("2026-01-01", null, "100")] },
    { history: [p("2026-01-01", null, "5000", { currency: "PHP" })] },
    { history: [p("2026-01-01", "2026-06-30", "40")] }, // archived/ended later: still counted historically
  ];
  it("keeps currencies separate", () => {
    const t = spendByCurrency(subs, "2026-03-01");
    expect(t.get("USD")?.toFixed()).toBe("140");
    expect(t.get("PHP")?.toFixed()).toBe("5000");
  });
  it("includes ended/archived subscriptions at historical dates but not afterwards", () => {
    expect(spendByCurrency(subs, "2026-05-01").get("USD")?.toFixed()).toBe("140");
    expect(spendByCurrency(subs, "2026-07-01").get("USD")?.toFixed()).toBe("100");
  });
  it("converts only when every rate exists, labelling the rate", () => {
    const r = convertTotals(new Map([["USD", new Decimal(100)], ["PHP", new Decimal(5800)]]), "USD", "2026-10-01", rates);
    expect(r.ok && r.total.toFixed()).toBe("200");
    expect(r.ok && r.notes[0]).toMatch(/2026-06-01, BSP/);
    expect(convertTotals(new Map([["EUR", new Decimal(1)]]), "USD", "2026-10-01", rates).ok).toBe(false);
  });
});

describe("parseRate / CSV", () => {
  it("validates a rate", () => {
    expect(parseRate({ base_currency: "usd", quote_currency: "php", rate: "56.5", effective_date: "2026-10-01" }).ok).toBe(true);
    expect(parseRate({ base_currency: "USD", quote_currency: "USD", rate: "1", effective_date: "2026-10-01" }).ok).toBe(false);
    expect(parseRate({ base_currency: "USD", quote_currency: "PHP", rate: "0", effective_date: "2026-10-01" }).ok).toBe(false);
    expect(parseRate({ base_currency: "USD", quote_currency: "PHP", rate: "1.123456789", effective_date: "2026-10-01" }).ok).toBe(false);
  });
  it("parses a CSV with quotes, CRLF, bad rows and duplicates", () => {
    const csv = [
      "base_currency,quote_currency,rate,effective_date,source",
      'USD,PHP,56.5,2026-10-01,"BSP, daily"',
      "USD,PHP,57,2026-10-01,dup",
      "USD,EUR,abc,2026-10-01,",
      "EUR,USD,1.08,2026-10-02,",
    ].join("\r\n");
    const r = parseRatesCsv(csv);
    expect(r.valid).toHaveLength(2);
    expect(r.valid[0].source).toBe("BSP, daily");
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });
  it("reports missing columns and empty files", () => {
    expect(parseRatesCsv("a,b\n1,2").errors[0].message).toMatch(/Missing column/);
    expect(parseRatesCsv("").errors).toHaveLength(1);
  });
});
