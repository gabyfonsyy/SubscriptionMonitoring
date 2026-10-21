import Decimal from "decimal.js";
import { addDays } from "@/lib/date";
import { spendByCurrency, type CostPeriod } from "@/domain/cost-history";

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

export type Breakdown = { label: string; amount: Decimal }[];

/** Monthly spend per currency broken down by a key (category/team). Currencies are never mixed. */
export function breakdownByCurrency(
  subs: SummarySubscription[],
  key: (s: SummarySubscription) => string,
): Map<string, Breakdown> {
  const acc = new Map<string, Map<string, Decimal>>();
  for (const s of subs.filter(isLive)) {
    if (!s.current_currency || s.current_normalized_monthly == null) continue;
    const byLabel = acc.get(s.current_currency) ?? new Map<string, Decimal>();
    add(byLabel, key(s), new Decimal(String(s.current_normalized_monthly)));
    acc.set(s.current_currency, byLabel);
  }
  const out = new Map<string, Breakdown>();
  for (const [cur, m] of acc) {
    out.set(cur, [...m].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount.cmp(a.amount) || a.label.localeCompare(b.label)));
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
