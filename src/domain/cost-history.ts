import Decimal from "decimal.js";
import { addDays, isValidISODate } from "@/lib/date";
import { normalizeMonthly, resolveCycleMonths } from "@/domain/money";
import { convert, type Rate } from "@/domain/exchange-rates";
import type { BillingFrequency, ChangeType } from "@/lib/supabase/database.types";

export type CostPeriod = {
  effective_from: string;
  effective_to: string | null;
  amount: string | number;
  currency: string;
  billing_frequency: BillingFrequency;
  normalized_monthly: string | number | null;
  change_type?: ChangeType;
};

const sortAsc = <T extends { effective_from: string }>(h: T[]) =>
  [...h].sort((a, b) => (a.effective_from < b.effective_from ? -1 : a.effective_from > b.effective_from ? 1 : 0));

/** The price period in effect on `date` (inclusive bounds), or null when none applies. */
export function priceAt<T extends Pick<CostPeriod, "effective_from" | "effective_to">>(
  history: T[],
  date: string,
): T | null {
  const hit = history.filter((p) => p.effective_from <= date && (p.effective_to == null || p.effective_to >= date));
  if (hit.length === 0) return null;
  return hit.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
}

export type SeriesPoint = {
  /** First day of the month, ISO. */
  month: string;
  /** The date the price was sampled on (month end, or today for the current month). */
  sampledOn: string;
  /** Normalized monthly amount; null when no price applies or the charge is one-time. */
  amount: string | null;
  currency: string | null;
  /** True when the price in effect is dated in the future (not yet billed). */
  scheduled: boolean;
};

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const nextMonth = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};
const monthEnd = (iso: string) => addDays(nextMonth(iso), -1);

/**
 * Normalized monthly cost per calendar month, picked by effective date. A change shows in the month
 * it starts. Runs from the first record to the later of the current month and the last scheduled one.
 */
export function monthlySeries(history: CostPeriod[], today: string): SeriesPoint[] {
  if (history.length === 0) return [];
  const asc = sortAsc(history);
  const last = asc[asc.length - 1].effective_from;
  const endMonth = monthStart(last > today ? last : today);
  const out: SeriesPoint[] = [];
  for (let m = monthStart(asc[0].effective_from); m <= endMonth; m = nextMonth(m)) {
    const end = monthEnd(m);
    const sampledOn = end > today && m <= today ? today : end;
    const p = priceAt(asc, sampledOn);
    out.push({
      month: m,
      sampledOn,
      amount: p?.normalized_monthly != null ? new Decimal(String(p.normalized_monthly)).toFixed() : null,
      currency: p?.currency ?? null,
      scheduled: !!p && p.effective_from > today,
    });
  }
  return out;
}

export type ConvertedPoint = SeriesPoint & { converted: string | null; note: string | null };

/** Expresses a series in one currency using dated rates; gaps (never guesses) when a rate is missing. */
export function convertSeries(points: SeriesPoint[], target: string, rates: Rate[]): ConvertedPoint[] {
  return points.map((p) => {
    if (p.amount == null || p.currency == null) return { ...p, converted: null, note: null };
    const c = convert(p.amount, p.currency, target, p.sampledOn, rates);
    return c.ok
      ? { ...p, converted: c.amount.toDecimalPlaces(4).toFixed(), note: p.currency === target ? null : `Converted at ${c.rate.toDecimalPlaces(6).toFixed()} (rate of ${c.rateDate})` }
      : { ...p, converted: null, note: c.reason };
  });
}

export type PriceChange = {
  from: string;
  to: string;
  currency: string;
  previous: string;
  current: string;
  absolute: string;
  /** Percent, or null when the previous amount was zero. */
  percent: string | null;
  changeType: ChangeType | undefined;
  /** Display annotation, derived from the recorded change type. */
  annotation: "increase" | "decrease" | "plan_change" | "discount" | null;
};

export type ChangeNote = { effective_from: string; reason: string };

/**
 * Change vs the previous period on normalized monthly cost. Only comparable periods are compared:
 * one-time charges and currency switches yield no change (never an unconverted difference).
 */
export function priceChanges(history: CostPeriod[]): Map<string, PriceChange | { note: string }> {
  const asc = sortAsc(history);
  const out = new Map<string, PriceChange | { note: string }>();
  for (let i = 1; i < asc.length; i++) {
    const prev = asc[i - 1];
    const cur = asc[i];
    if (prev.normalized_monthly == null || cur.normalized_monthly == null) {
      out.set(cur.effective_from, { note: "Not comparable (one-time charge)." });
      continue;
    }
    if (prev.currency !== cur.currency) {
      out.set(cur.effective_from, { note: `Currency changed ${prev.currency} → ${cur.currency}.` });
      continue;
    }
    const a = new Decimal(String(prev.normalized_monthly));
    const b = new Decimal(String(cur.normalized_monthly));
    const diff = b.minus(a);
    const ct = cur.change_type;
    out.set(cur.effective_from, {
      from: prev.effective_from,
      to: cur.effective_from,
      currency: cur.currency,
      previous: a.toFixed(),
      current: b.toFixed(),
      absolute: diff.toFixed(),
      percent: a.isZero() ? null : diff.div(a).mul(100).toDecimalPlaces(1).toFixed(),
      changeType: ct,
      annotation: ct === "increase" || ct === "decrease" || ct === "plan_change" || ct === "discount" ? ct : null,
    });
  }
  return out;
}

/** Same check the database RPC enforces: a new period must start after every existing one. */
export function validateNewPeriodStart(history: Pick<CostPeriod, "effective_from">[], effectiveFrom: string): string | null {
  const latest = history.reduce<string | null>((m, p) => (m == null || p.effective_from > m ? p.effective_from : m), null);
  if (latest != null && effectiveFrom <= latest) {
    return `A price already starts on ${latest}. Choose a later date, or correct that record instead.`;
  }
  return null;
}

export type PriceChangeInput = {
  effective_from: string;
  amount: string;
  currency: string;
  billing_frequency: BillingFrequency;
  cycle_months: number | null;
  change_type: ChangeType;
  reason: string | null;
};

const RECORDABLE: ChangeType[] = ["increase", "decrease", "plan_change", "discount", "other"];
export const RECORDABLE_CHANGE_TYPES = RECORDABLE;

type Raw = Record<string, string | undefined>;
const clean = (v: string | undefined) => (v?.trim() ? v.trim() : null);

function parseAmount(raw: string | null, errors: Record<string, string>): string | null {
  if (!raw) { errors.amount = "Enter the new billing amount."; return null; }
  try {
    const d = new Decimal(raw);
    if (!d.isFinite() || d.isNegative()) throw new Error();
    if (d.decimalPlaces() > 4) { errors.amount = "Use at most 4 decimal places."; return null; }
    return d.toFixed();
  } catch {
    errors.amount = "Enter a valid non-negative amount.";
    return null;
  }
}

function parseBilling(raw: Raw, errors: Record<string, string>) {
  const freq = clean(raw.billing_frequency) as BillingFrequency | null;
  const valid = ["monthly", "quarterly", "semi_annual", "annual", "multi_year", "one_time", "custom"];
  if (!freq || !valid.includes(freq)) { errors.billing_frequency = "Choose a billing frequency."; return null; }
  const customRaw = clean(raw.cycle_months);
  const resolved = resolveCycleMonths(freq, customRaw ? Number(customRaw) : null);
  if (!resolved.ok) { errors.cycle_months = resolved.error; return null; }
  return { freq, months: resolved.months };
}

/** Validates the "Record price change" form. */
export function parsePriceChange(
  raw: Raw,
  history: Pick<CostPeriod, "effective_from">[],
): { ok: true; value: PriceChangeInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const date = clean(raw.effective_from);
  if (!date || !isValidISODate(date)) errors.effective_from = "Enter a valid effective date.";
  else {
    const overlap = validateNewPeriodStart(history, date);
    if (overlap) errors.effective_from = overlap;
  }
  const amount = parseAmount(clean(raw.amount), errors);
  const currency = clean(raw.currency)?.toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) errors.currency = "Enter a 3-letter currency code (e.g. USD).";
  const billing = parseBilling(raw, errors);
  const ct = clean(raw.change_type) as ChangeType | null;
  if (!ct || !RECORDABLE.includes(ct)) errors.change_type = "Choose what kind of change this is.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      effective_from: date!,
      amount: amount!,
      currency,
      billing_frequency: billing!.freq,
      cycle_months: billing!.months,
      change_type: ct!,
      reason: clean(raw.reason),
    },
  };
}

export type CorrectionInput = {
  amount: string;
  currency: string;
  billing_frequency: BillingFrequency;
  cycle_months: number | null;
  normalized_monthly: string | null;
  reason: string;
};

/**
 * Validates a correction to an existing record. Dates are not editable here (that could break the
 * no-overlap rule); a reason is mandatory because the change is audited.
 */
export function parseCorrection(raw: Raw): { ok: true; value: CorrectionInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const amount = parseAmount(clean(raw.amount), errors);
  const currency = clean(raw.currency)?.toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) errors.currency = "Enter a 3-letter currency code (e.g. USD).";
  const billing = parseBilling(raw, errors);
  const reason = clean(raw.reason);
  if (!reason) errors.reason = "Say why this record is being corrected.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      amount: amount!,
      currency,
      billing_frequency: billing!.freq,
      cycle_months: billing!.months,
      normalized_monthly: normalizeMonthly(amount!, billing!.months)?.toFixed() ?? null,
      reason: reason!,
    },
  };
}

/** Sum of normalized monthly cost per currency as of `date`. Currencies are never mixed. Archived
 * subscriptions are included on purpose so historical dates stay correct. */
export function spendByCurrency(
  subscriptions: { history: CostPeriod[] }[],
  date: string,
): Map<string, Decimal> {
  const totals = new Map<string, Decimal>();
  for (const s of subscriptions) {
    const p = priceAt(s.history, date);
    if (!p || p.normalized_monthly == null) continue;
    totals.set(p.currency, (totals.get(p.currency) ?? new Decimal(0)).plus(String(p.normalized_monthly)));
  }
  return totals;
}

export type ConvertedTotal =
  | { ok: true; total: Decimal; notes: string[] }
  | { ok: false; reason: string };

/** Converts per-currency totals into one currency, labelling each rate used; fails whole if any rate is missing. */
export function convertTotals(totals: Map<string, Decimal>, target: string, date: string, rates: Rate[]): ConvertedTotal {
  let sum = new Decimal(0);
  const notes: string[] = [];
  for (const [cur, amt] of totals) {
    const c = convert(amt, cur, target, date, rates);
    if (!c.ok) return { ok: false, reason: c.reason };
    sum = sum.plus(c.amount);
    if (cur !== target) notes.push(`${cur}→${target} at ${c.rate.toDecimalPlaces(6).toFixed()} (rate of ${c.rateDate}${c.source ? `, ${c.source}` : ""})`);
  }
  return { ok: true, total: sum, notes };
}
