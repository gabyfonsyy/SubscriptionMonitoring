import { parseISODate } from "@/lib/date";

/** Consistent date display: "20 Oct 2026". Input is an ISO date string. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseISODate(iso.slice(0, 10)));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(iso));
}

/**
 * Display-only money formatting. Amounts arrive as decimal strings; they are never summed or
 * compared as floats anywhere (calculations use decimal.js in src/domain).
 */
export function formatMoney(amount: string | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !currency) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}
