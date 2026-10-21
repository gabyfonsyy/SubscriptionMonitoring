import { addDays } from "@/lib/date";

/** Cards are only ever stored as nickname + last four + expiry. These helpers keep it that way. */

export type CardInput = {
  label: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  responsible_team_id: string | null;
  cardholder_note: string | null;
  notes: string | null;
};

type Raw = Record<string, string | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: string | undefined) => (v?.trim() ? v.trim() : null);

/** True when text contains something shaped like a full card number (13–19 digits, spaces/dashes allowed). */
export function looksLikeCardNumber(text: string): boolean {
  return /(?:\d[ -]?){13,19}/.test(text) && text.replace(/\D/g, "").length >= 13;
}

/** True when text looks like a CVV/security code label with digits. */
export function looksLikeSecurityCode(text: string): boolean {
  return /\b(cvv|cvc|cid|security code)\b\D{0,6}\d{3,4}\b/i.test(text);
}

export function parseCard(raw: Raw): { ok: true; value: CardInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const label = clean(raw.label);
  if (!label) errors.label = "Give the card a nickname (e.g. “Engineering Visa”).";

  const lastFour = clean(raw.last_four) ?? "";
  if (!/^\d{4}$/.test(lastFour)) errors.last_four = "Enter exactly the last 4 digits.";

  const month = Number(clean(raw.expiry_month));
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.expiry_month = "Month must be 1–12.";
  const yearRaw = Number(clean(raw.expiry_year));
  const year = yearRaw >= 0 && yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.expiry_year = "Enter a valid expiry year.";

  const team = clean(raw.responsible_team_id);
  if (team && !UUID.test(team)) errors.responsible_team_id = "Invalid selection.";

  const holder = clean(raw.cardholder_note);
  if (holder && holder.length > 200) errors.cardholder_note = "Keep this under 200 characters.";
  const notes = clean(raw.notes);

  // Never accept sensitive card data in any free-text field.
  for (const [key, value] of [["label", label], ["cardholder_note", holder], ["notes", notes]] as const) {
    if (value && !errors[key] && (looksLikeCardNumber(value) || looksLikeSecurityCode(value))) {
      errors[key] = "This looks like a full card number or security code. Only the last 4 digits may be stored.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { label: label!, last_four: lastFour, expiry_month: month, expiry_year: year, responsible_team_id: team, cardholder_note: holder, notes },
  };
}

export type ExpiryState = "expired" | "expiring_soon" | "ok";

/** Last day of the card's expiry month (cards are valid through the end of that month). */
export function expiryDate(month: number, year: number): string {
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}

export const EXPIRING_SOON_DAYS = 60;

export function expiryState(month: number, year: number, today: string, windowDays = EXPIRING_SOON_DAYS): ExpiryState {
  const end = expiryDate(month, year);
  if (end < today) return "expired";
  return end <= addDays(today, windowDays) ? "expiring_soon" : "ok";
}

export const formatExpiry = (month: number, year: number) => `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
