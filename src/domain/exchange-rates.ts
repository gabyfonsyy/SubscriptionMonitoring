import Decimal from "decimal.js";
import { isValidISODate } from "@/lib/date";

export type Rate = {
  base_currency: string;
  quote_currency: string;
  /** 1 base_currency = rate quote_currency */
  rate: string | number;
  effective_date: string;
  source: string | null;
};

export type Conversion =
  | { ok: true; amount: Decimal; rate: Decimal; rateDate: string; source: string | null; inverted: boolean }
  | { ok: false; reason: string };

/**
 * Converts using the latest rate dated on or before `date` (never a later one). Looks for a direct
 * rate first, then the inverse of a quote->base rate; the more recent of the two wins (direct on ties).
 * When no rate exists it says so instead of guessing.
 */
export function convert(
  amount: Decimal.Value,
  from: string,
  to: string,
  date: string,
  rates: Rate[],
): Conversion {
  if (from === to) {
    return { ok: true, amount: new Decimal(amount), rate: new Decimal(1), rateDate: date, source: null, inverted: false };
  }
  const latest = (base: string, quote: string) =>
    rates
      .filter((r) => r.base_currency === base && r.quote_currency === quote && r.effective_date <= date)
      .sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1))[0];

  const direct = latest(from, to);
  const inverse = latest(to, from);
  const useInverse = inverse && (!direct || inverse.effective_date > direct.effective_date);
  const chosen = useInverse ? inverse : direct;
  if (!chosen) return { ok: false, reason: `No rate available for ${from} → ${to} on or before ${date}.` };

  const rate = useInverse ? new Decimal(1).div(new Decimal(String(chosen.rate))) : new Decimal(String(chosen.rate));
  return {
    ok: true,
    amount: new Decimal(amount).mul(rate),
    rate,
    rateDate: chosen.effective_date,
    source: chosen.source,
    inverted: !!useInverse,
  };
}

export type RateInput = { base_currency: string; quote_currency: string; rate: string; effective_date: string; source: string | null };

/** Validates one exchange-rate entry (form or CSV row). */
export function parseRate(raw: Record<string, string | undefined>): { ok: true; value: RateInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const base = raw.base_currency?.trim().toUpperCase() ?? "";
  const quote = raw.quote_currency?.trim().toUpperCase() ?? "";
  const date = raw.effective_date?.trim() ?? "";
  const rateRaw = raw.rate?.trim() ?? "";
  if (!/^[A-Z]{3}$/.test(base)) errors.base_currency = "Use a 3-letter currency code.";
  if (!/^[A-Z]{3}$/.test(quote)) errors.quote_currency = "Use a 3-letter currency code.";
  if (!errors.base_currency && !errors.quote_currency && base === quote) errors.quote_currency = "Currencies must differ.";
  if (!isValidISODate(date)) errors.effective_date = "Use a valid date (YYYY-MM-DD).";
  let rate = "";
  try {
    const d = new Decimal(rateRaw);
    if (!d.isFinite() || d.lte(0)) throw new Error();
    if (d.decimalPlaces() > 8) errors.rate = "Use at most 8 decimal places.";
    else if (d.gte(new Decimal(10).pow(10))) errors.rate = "Rate is too large.";
    else rate = d.toFixed();
  } catch {
    errors.rate = "Enter a rate greater than 0.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { base_currency: base, quote_currency: quote, rate, effective_date: date, source: raw.source?.trim() || null } };
}

/** Minimal RFC-4180-ish CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export const MAX_CSV_ROWS = 500;

export type CsvImport = {
  valid: RateInput[];
  errors: { line: number; message: string }[];
};

/** Header row required: base_currency, quote_currency, rate, effective_date, [source]. */
export function parseRatesCsv(text: string): CsvImport {
  const rows = parseCsv(text);
  if (rows.length === 0) return { valid: [], errors: [{ line: 1, message: "The file is empty." }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const missing = ["base_currency", "quote_currency", "rate", "effective_date"].filter((h) => idx(h) < 0);
  if (missing.length > 0) {
    return { valid: [], errors: [{ line: 1, message: `Missing column(s): ${missing.join(", ")}.` }] };
  }
  if (rows.length - 1 > MAX_CSV_ROWS) {
    return { valid: [], errors: [{ line: 1, message: `Too many rows (max ${MAX_CSV_ROWS}).` }] };
  }
  const valid: RateInput[] = [];
  const errors: CsvImport["errors"] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (name: string) => (idx(name) >= 0 ? r[idx(name)] : undefined);
    const parsed = parseRate({
      base_currency: get("base_currency"),
      quote_currency: get("quote_currency"),
      rate: get("rate"),
      effective_date: get("effective_date"),
      source: get("source"),
    });
    if (!parsed.ok) {
      errors.push({ line, message: Object.values(parsed.errors).join(" ") });
      return;
    }
    const key = `${parsed.value.base_currency}/${parsed.value.quote_currency}/${parsed.value.effective_date}`;
    if (seen.has(key)) {
      errors.push({ line, message: `Duplicate of an earlier row (${key}).` });
      return;
    }
    seen.add(key);
    valid.push(parsed.value);
  });
  return { valid, errors };
}
