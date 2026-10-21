import Decimal from "decimal.js";
import type { BillingFrequency } from "@/lib/supabase/database.types";

/** Months per billing cycle for fixed frequencies; null for one-time. */
const FIXED_CYCLE_MONTHS: Partial<Record<BillingFrequency, number | null>> = {
  monthly: 1,
  quarterly: 3,
  semi_annual: 6,
  annual: 12,
  one_time: null,
};

export function isFlexibleCycle(frequency: BillingFrequency) {
  return frequency === "multi_year" || frequency === "custom";
}

/**
 * Resolves the number of months in a billing cycle.
 * Returns an error string when a multi-year/custom cycle has no valid length.
 */
export function resolveCycleMonths(
  frequency: BillingFrequency,
  customMonths?: number | null,
): { ok: true; months: number | null } | { ok: false; error: string } {
  if (frequency in FIXED_CYCLE_MONTHS) {
    return { ok: true, months: FIXED_CYCLE_MONTHS[frequency] ?? null };
  }
  if (!customMonths || !Number.isInteger(customMonths) || customMonths < 1 || customMonths > 120) {
    return { ok: false, error: "Enter the cycle length in months (1–120)." };
  }
  return { ok: true, months: customMonths };
}

/**
 * Amount per month, rounded to 4 decimal places (matches the database column).
 * Returns null for one-time charges: they are never treated as recurring.
 */
export function normalizeMonthly(
  amount: Decimal.Value,
  cycleMonths: number | null | undefined,
): Decimal | null {
  if (cycleMonths == null) return null;
  if (cycleMonths <= 0) throw new Error("cycleMonths must be positive");
  return new Decimal(amount).div(cycleMonths).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}
