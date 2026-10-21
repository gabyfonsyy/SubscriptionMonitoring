import Decimal from "decimal.js";
import { addDays } from "@/lib/date";
import { priceChanges, spendByCurrency, type CostPeriod } from "@/domain/cost-history";

export type SummarySubscription = {
  status: string;
  category: string;
  team_name: string | null;
  next_renewal_date: string | null;
  current_currency: string | null;
  current_normalized_monthly: string | number | null;
};

export type CurrencyTotals = Map<string, Decimal>;

const add = (m: CurrencyTotals, cur: string, amt: Decimal) => m.set(cur, (m.get(cur) ?? new Decimal(0)).plus(amt));

/** Subscriptions counted as live spend: not archived and not expired. */
export const isLive = (s: { status: string }) => s.status !== "archived" && s.status !== "expired";

export function summarize(subs: SummarySubscription[], today: string) {
  const live = subs.filter(isLive);
  const monthly: CurrencyTotals = new Map();
  for (const s of live) {
    if (s.current_currency && s.current_normalized_monthly != null) add(monthly, s.current_currency, new Decimal(String(s.current_normalized_monthly)));
  }
  const annual: CurrencyTotals = new Map([...monthly].map(([c, a]) => [c, a.mul(12)]));
  const horizon = addDays(today, 30);
  const renewals30 = live.filter((s) => s.next_renewal_date && s.next_renewal_date >= today && s.next_renewal_date <= horizon).length;
  return { activeCount: live.length, monthly, annual, renewals30 };
}

export type Breakdown = { label: string; amount: Decimal; href?: string }[];
export type BreakdownKey = string | { label: string; href?: string };

/** Monthly spend per currency broken down by a key (category/team). Currencies are never mixed. */
export function breakdownByCurrency<T extends SummarySubscription>(
  subs: T[],
  key: (s: T) => BreakdownKey,
): Map<string, Breakdown> {
  const acc = new Map<string, Map<string, Decimal>>();
  const hrefs = new Map<string, string | undefined>();
  for (const s of subs.filter(isLive)) {
    if (!s.current_currency || s.current_normalized_monthly == null) continue;
    const byLabel = acc.get(s.current_currency) ?? new Map<string, Decimal>();
    const k = key(s);
    const label = typeof k === "string" ? k : k.label;
    if (typeof k !== "string") hrefs.set(label, k.href);
    add(byLabel, label, new Decimal(String(s.current_normalized_monthly)));
    acc.set(s.current_currency, byLabel);
  }
  const out = new Map<string, Breakdown>();
  for (const [cur, m] of acc) {
    out.set(cur, [...m].map(([label, amount]) => ({ label, amount, href: hrefs.get(label) })).sort((a, b) => b.amount.cmp(a.amount) || a.label.localeCompare(b.label)));
  }
  return out;
}

export type TrendSubscription = { archived_at: string | null; history: CostPeriod[] };
export type TrendPoint = { month: string; totals: CurrencyTotals };

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const prevMonth = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
};
const nextMonth = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

/**
 * Normalized monthly spend per currency for the last `months` months, picked by effective-dated price.
 * Archived subscriptions count for the months before they were archived, so history stays correct.
 */
export function monthlyTrend(subs: TrendSubscription[], today: string, months = 12): TrendPoint[] {
  const starts: string[] = [];
  for (let m = monthStart(today), i = 0; i < months; i++, m = prevMonth(m)) starts.unshift(m);
  return starts.map((month) => {
    const end = addDays(nextMonth(month), -1);
    const sampled = end > today ? today : end;
    const active = subs.filter((s) => !s.archived_at || s.archived_at.slice(0, 10) > sampled);
    return { month, totals: spendByCurrency(active, sampled) };
  });
}

export type MonthDelta = { currency: string; previous: Decimal; current: Decimal; percent: Decimal | null };

/** Current month vs the month before it, per currency. Percent is null when the previous total was zero. */
export function monthOverMonth(trend: TrendPoint[]): MonthDelta[] {
  if (trend.length < 2) return [];
  const prev = trend[trend.length - 2].totals;
  const cur = trend[trend.length - 1].totals;
  const out: MonthDelta[] = [];
  for (const currency of new Set([...prev.keys(), ...cur.keys()])) {
    const a = prev.get(currency) ?? new Decimal(0);
    const b = cur.get(currency) ?? new Decimal(0);
    out.push({ currency, previous: a, current: b, percent: a.isZero() ? null : b.minus(a).div(a).mul(100) });
  }
  return out.sort((x, y) => x.currency.localeCompare(y.currency));
}

export type RecentChange = {
  subscriptionId: string;
  name: string;
  effectiveFrom: string;
  currency: string;
  previous: string;
  current: string;
  absolute: string;
  percent: string | null;
  scheduled: boolean;
};

/**
 * Price changes that took effect in the last `days` days, plus ones scheduled to take effect, newest first.
 * Uses the same like-for-like comparison as the cost history (no cross-currency or one-time diffs).
 */
export function recentPriceChanges(
  subs: { id: string; name: string; archived_at: string | null; history: CostPeriod[] }[],
  today: string,
  days = 90,
): RecentChange[] {
  const since = addDays(today, -days);
  const out: RecentChange[] = [];
  for (const s of subs) {
    if (s.archived_at) continue;
    for (const [from, c] of priceChanges(s.history)) {
      if ("note" in c || from < since || Number(c.absolute) === 0) continue;
      out.push({
        subscriptionId: s.id, name: s.name, effectiveFrom: from, currency: c.currency,
        previous: c.previous, current: c.current, absolute: c.absolute, percent: c.percent, scheduled: from > today,
      });
    }
  }
  return out.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || a.name.localeCompare(b.name));
}
