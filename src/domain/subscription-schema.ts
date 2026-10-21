import Decimal from "decimal.js";
import { isValidISODate } from "@/lib/date";
import { resolveCycleMonths } from "@/domain/money";
import { CATEGORIES, CRITICALITIES, FREQUENCIES, STATUSES } from "@/domain/constants";
import type {
  BillingFrequency,
  Category,
  Criticality,
  SubscriptionStatus,
} from "@/lib/supabase/database.types";

export type SubscriptionInput = {
  name: string;
  vendor: string;
  description: string | null;
  business_purpose: string | null;
  product_id: string | null;
  responsible_team_id: string | null;
  owner_id: string | null;
  category: Category;
  billing_frequency: BillingFrequency;
  cycle_months: number | null;
  auto_renew: boolean | null;
  next_billing_date: string | null;
  next_renewal_date: string | null;
  start_date: string | null;
  expiration_date: string | null;
  cancellation_notice_days: number | null;
  payment_method_id: string | null;
  status: Exclude<SubscriptionStatus, "archived">;
  cost_center: string | null;
  criticality: Criticality | null;
  notes: string | null;
};

export type InitialCostInput = {
  amount: string;
  currency: string;
  effective_from: string | null;
  reason: string | null;
};

export type FieldErrors = Record<string, string>;

export type ParseResult =
  | { ok: true; subscription: SubscriptionInput; cost: InitialCostInput | null }
  | { ok: false; errors: FieldErrors };

type Raw = Record<string, string | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: string | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};
const oneOf = <T extends string>(list: { value: T }[], v: string | null): v is T =>
  v != null && list.some((i) => i.value === v);

/**
 * Validates the raw subscription form values. Pure and framework-free so it can be unit tested
 * and reused by a future API. `withCost` enables the initial-price fields (create only).
 */
export function parseSubscriptionForm(raw: Raw, opts: { withCost: boolean }): ParseResult {
  const errors: FieldErrors = {};

  const name = clean(raw.name);
  const vendor = clean(raw.vendor);
  if (!name) errors.name = "Subscription name is required.";
  if (!vendor) errors.vendor = "Vendor is required.";

  const frequencyRaw = clean(raw.billing_frequency);
  if (!oneOf(FREQUENCIES, frequencyRaw)) errors.billing_frequency = "Choose a billing frequency.";
  const frequency = frequencyRaw as BillingFrequency;

  const category = clean(raw.category) ?? "other";
  if (!oneOf(CATEGORIES, category)) errors.category = "Choose a category.";

  const status = clean(raw.status) ?? "active";
  if (!oneOf(STATUSES, status) || status === "archived") {
    errors.status = "Choose a status (use Archive to archive).";
  }

  const criticality = clean(raw.criticality);
  if (criticality && !oneOf(CRITICALITIES, criticality)) errors.criticality = "Choose a valid criticality.";

  for (const key of ["product_id", "responsible_team_id", "owner_id", "payment_method_id"] as const) {
    const v = clean(raw[key]);
    if (v && !UUID.test(v)) errors[key] = "Invalid selection.";
  }

  const dateField = (key: string, label: string) => {
    const v = clean(raw[key]);
    if (v && !isValidISODate(v)) errors[key] = `${label} is not a valid date.`;
    return v;
  };
  const start = dateField("start_date", "Start date");
  const expiration = dateField("expiration_date", "Expiration date");
  const nextBilling = dateField("next_billing_date", "Next billing date");
  const nextRenewal = dateField("next_renewal_date", "Next renewal date");
  if (start && expiration && !errors.start_date && !errors.expiration_date && expiration < start) {
    errors.expiration_date = "Expiration date cannot be before the start date.";
  }

  let notice: number | null = null;
  const noticeRaw = clean(raw.cancellation_notice_days);
  if (noticeRaw) {
    notice = Number(noticeRaw);
    if (!Number.isInteger(notice) || notice < 0 || notice > 3650) {
      errors.cancellation_notice_days = "Enter a whole number of days (0 or more).";
    }
  }

  let cycleMonths: number | null = null;
  if (!errors.billing_frequency) {
    const customRaw = clean(raw.cycle_months);
    const resolved = resolveCycleMonths(frequency, customRaw ? Number(customRaw) : null);
    if (resolved.ok) cycleMonths = resolved.months;
    else errors.cycle_months = resolved.error;
  }

  const autoRenewRaw = clean(raw.auto_renew);
  const autoRenew = autoRenewRaw === "yes" ? true : autoRenewRaw === "no" ? false : null;

  let cost: InitialCostInput | null = null;
  if (opts.withCost) {
    const amountRaw = clean(raw.amount);
    const currencyRaw = clean(raw.currency)?.toUpperCase() ?? null;
    if (amountRaw || currencyRaw) {
      let amountOk = false;
      if (!amountRaw) errors.amount = "Enter the billing amount (or clear the currency).";
      else {
        try {
          const d = new Decimal(amountRaw);
          if (d.isNegative() || !d.isFinite()) throw new Error();
          if (d.decimalPlaces() > 4) errors.amount = "Use at most 4 decimal places.";
          else amountOk = true;
        } catch {
          errors.amount = "Enter a valid non-negative amount.";
        }
      }
      if (!currencyRaw || !/^[A-Z]{3}$/.test(currencyRaw)) {
        errors.currency = "Enter a 3-letter currency code (e.g. USD).";
      } else if (amountOk) {
        cost = {
          amount: new Decimal(amountRaw!).toFixed(),
          currency: currencyRaw,
          effective_from: dateField("cost_effective_from", "Price effective date"),
          reason: clean(raw.cost_reason),
        };
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    cost,
    subscription: {
      name: name!,
      vendor: vendor!,
      description: clean(raw.description),
      business_purpose: clean(raw.business_purpose),
      product_id: clean(raw.product_id),
      responsible_team_id: clean(raw.responsible_team_id),
      owner_id: clean(raw.owner_id),
      category: category as Category,
      billing_frequency: frequency,
      cycle_months: cycleMonths,
      auto_renew: autoRenew,
      next_billing_date: nextBilling,
      next_renewal_date: nextRenewal,
      start_date: start,
      expiration_date: expiration,
      cancellation_notice_days: notice,
      payment_method_id: clean(raw.payment_method_id),
      status: status as SubscriptionInput["status"],
      cost_center: clean(raw.cost_center),
      criticality: criticality as Criticality | null,
      notes: clean(raw.notes),
    },
  };
}
