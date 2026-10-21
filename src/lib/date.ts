/** Dates are handled as ISO "YYYY-MM-DD" strings and compared in UTC to avoid timezone drift. */

const MS_PER_DAY = 86_400_000;

export function parseISODate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseISODate(toISO) - parseISODate(fromISO)) / MS_PER_DAY);
}

export function addDays(iso: string, days: number): string {
  return new Date(parseISODate(iso) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(parseISODate(value)).toISOString().slice(0, 10) === value;
}

/** Today's date in the business timezone (Manila by default), as ISO. */
export function todayISO(timeZone = "Asia/Manila", now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
