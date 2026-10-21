import { addDays, daysBetween } from "@/lib/date";
import { expiryDate, expiryState, formatExpiry } from "@/domain/cards";
import { priceChanges, type CostPeriod } from "@/domain/cost-history";
import { findPotentialDuplicates } from "@/domain/duplicates";
import type { AlertSeverity, AlertType } from "@/lib/supabase/database.types";

export type EngineRule = { alert_type: AlertType; enabled: boolean; reminder_days: number[] };

export type EngineSubscription = {
  id: string;
  name: string;
  vendor: string;
  product_id: string | null;
  status: string;
  billing_frequency: string;
  auto_renew: boolean | null;
  next_renewal_date: string | null;
  cancellation_notice_days: number | null;
  expiration_date: string | null;
  owner_id: string | null;
  current_amount: string | number | null;
  payment_method_id: string | null;
  created_at: string;
  archived_at: string | null;
};

export type EngineCard = {
  id: string;
  label: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  retired_at: string | null;
};

export type EngineCostRow = CostPeriod & { id: string; subscription_id: string };

export type AlertCandidate = {
  subscription_id: string | null;
  payment_method_id: string | null;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  due_date: string | null;
  reminder_days: number | null;
  /** Same business event => same key, so re-runs and retries never create a second alert. */
  dedupe_key: string;
};

export const isLiveStatus = (status: string) => status !== "archived" && status !== "expired";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const severityForDays = (days: number): AlertSeverity => (days <= 7 ? "critical" : days <= 14 ? "warning" : "info");

/** The tightest reminder interval already crossed (smallest r with days <= r), so a late-added item sends one alert, not three. */
export function crossedInterval(days: number, reminderDays: number[]): number | null {
  if (days < 0) return null;
  const crossed = reminderDays.filter((r) => days <= r).sort((a, b) => a - b);
  return crossed.length > 0 ? crossed[0] : null;
}

/**
 * Pure alert evaluation: given the current data and rules, returns every alert that should exist.
 * Disabled rules produce nothing. Persisting, de-duplicating and sending happen elsewhere.
 */
export function evaluateAlerts(input: {
  subscriptions: EngineSubscription[];
  cards: EngineCard[];
  costHistory: EngineCostRow[];
  rules: EngineRule[];
  today: string;
}): AlertCandidate[] {
  const { subscriptions, cards, costHistory, today } = input;
  const rule = (t: AlertType) => input.rules.find((r) => r.alert_type === t);
  const on = (t: AlertType) => rule(t)?.enabled === true;
  const days = (t: AlertType) => rule(t)?.reminder_days ?? [];
  const out: AlertCandidate[] = [];
  const live = subscriptions.filter((s) => isLiveStatus(s.status));
  const month = today.slice(0, 7);

  for (const s of live) {
    const willRenew = s.auto_renew !== false;

    if (on("renewal_approaching") && s.next_renewal_date) {
      const d = daysBetween(today, s.next_renewal_date);
      const r = crossedInterval(d, days("renewal_approaching"));
      if (r != null) {
        out.push({
          subscription_id: s.id, payment_method_id: null, alert_type: "renewal_approaching", severity: severityForDays(d),
          title: `${s.name} renews ${d === 0 ? "today" : `in ${plural(d, "day")}`}`,
          detail: `Renewal date ${s.next_renewal_date}.${s.auto_renew === true ? " Auto-renews." : s.auto_renew === false ? " Will not auto-renew." : " Auto-renewal unknown."}`,
          due_date: s.next_renewal_date, reminder_days: r, dedupe_key: `renewal_approaching:${s.id}:${s.next_renewal_date}:${r}`,
        });
      }
    }

    if (on("cancellation_deadline") && s.next_renewal_date && s.cancellation_notice_days != null && willRenew) {
      const deadline = addDays(s.next_renewal_date, -s.cancellation_notice_days);
      const d = daysBetween(today, deadline);
      const r = crossedInterval(d, days("cancellation_deadline"));
      if (r != null) {
        out.push({
          subscription_id: s.id, payment_method_id: null, alert_type: "cancellation_deadline", severity: severityForDays(d),
          title: `Last day to cancel ${s.name} is ${d === 0 ? "today" : `in ${plural(d, "day")}`}`,
          detail: `Cancel by ${deadline} to avoid the ${s.next_renewal_date} renewal.`,
          due_date: deadline, reminder_days: r, dedupe_key: `cancellation_deadline:${s.id}:${deadline}:${r}`,
        });
      }
    }

    if (on("subscription_expiring") && s.expiration_date) {
      const d = daysBetween(today, s.expiration_date);
      const r = crossedInterval(d, days("subscription_expiring"));
      if (r != null) {
        out.push({
          subscription_id: s.id, payment_method_id: null, alert_type: "subscription_expiring", severity: severityForDays(d),
          title: `${s.name} expires ${d === 0 ? "today" : `in ${plural(d, "day")}`}`,
          detail: `Expiration date ${s.expiration_date}.`,
          due_date: s.expiration_date, reminder_days: r, dedupe_key: `subscription_expiring:${s.id}:${s.expiration_date}:${r}`,
        });
      }
    }

    if (on("missing_details")) {
      const missing: string[] = [];
      if (!s.owner_id) missing.push("owner");
      if (s.current_amount == null && s.billing_frequency !== "one_time") missing.push("current price");
      if (!s.next_renewal_date && s.billing_frequency !== "one_time") missing.push("renewal date");
      if (missing.length > 0) {
        out.push({
          subscription_id: s.id, payment_method_id: null, alert_type: "missing_details", severity: "info",
          title: `${s.name} is missing details`, detail: `Missing: ${missing.join(", ")}.`,
          due_date: null, reminder_days: null, dedupe_key: `missing_details:${s.id}:${month}`,
        });
      }
    }

    if (on("marked_for_review") && s.status === "under_review") {
      out.push({
        subscription_id: s.id, payment_method_id: null, alert_type: "marked_for_review", severity: "warning",
        title: `${s.name} is under review`, detail: "Decide whether to keep, change or cancel it.",
        due_date: null, reminder_days: null, dedupe_key: `marked_for_review:${s.id}:${month}`,
      });
    }

    if (on("newly_registered") && daysBetween(s.created_at.slice(0, 10), today) <= 1) {
      out.push({
        subscription_id: s.id, payment_method_id: null, alert_type: "newly_registered", severity: "info",
        title: `New subscription registered: ${s.name}`, detail: `Vendor: ${s.vendor}.`,
        due_date: null, reminder_days: null, dedupe_key: `newly_registered:${s.id}`,
      });
    }
  }

  // Cards: only cards still in use by a live subscription matter.
  if (on("payment_card_expiring") || on("payment_card_expired")) {
    const usedBy = new Map<string, string[]>();
    for (const s of live) if (s.payment_method_id) usedBy.set(s.payment_method_id, [...(usedBy.get(s.payment_method_id) ?? []), s.name]);
    for (const c of cards) {
      const names = usedBy.get(c.id);
      if (!names || c.retired_at) continue;
      const exp = expiryDate(c.expiry_month, c.expiry_year);
      const label = `${c.label} •••• ${c.last_four}`;
      const used = `Used by ${names.slice(0, 5).join(", ")}${names.length > 5 ? ` and ${names.length - 5} more` : ""}.`;
      if (expiryState(c.expiry_month, c.expiry_year, today, 0) === "expired") {
        if (on("payment_card_expired")) {
          out.push({
            subscription_id: null, payment_method_id: c.id, alert_type: "payment_card_expired", severity: "critical",
            title: `Card ${label} has expired`, detail: `Expired ${formatExpiry(c.expiry_month, c.expiry_year)}. ${used}`,
            due_date: exp, reminder_days: null, dedupe_key: `payment_card_expired:${c.id}:${exp}`,
          });
        }
      } else if (on("payment_card_expiring")) {
        const d = daysBetween(today, exp);
        const r = crossedInterval(d, days("payment_card_expiring"));
        if (r != null) {
          out.push({
            subscription_id: null, payment_method_id: c.id, alert_type: "payment_card_expiring", severity: severityForDays(d),
            title: `Card ${label} expires in ${plural(d, "day")}`, detail: `Valid through ${exp}. ${used}`,
            due_date: exp, reminder_days: r, dedupe_key: `payment_card_expiring:${c.id}:${exp}:${r}`,
          });
        }
      }
    }
  }

  if (on("cost_increase")) {
    const bySub = new Map<string, EngineCostRow[]>();
    for (const h of costHistory) bySub.set(h.subscription_id, [...(bySub.get(h.subscription_id) ?? []), h]);
    const names = new Map(subscriptions.map((s) => [s.id, s]));
    for (const [subId, rows] of bySub) {
      const sub = names.get(subId);
      if (!sub || !isLiveStatus(sub.status)) continue;
      const changes = priceChanges(rows);
      for (const row of rows) {
        const c = changes.get(row.effective_from);
        if (!c || "note" in c || Number(c.absolute) <= 0) continue;
        const age = daysBetween(row.effective_from, today);
        if (age < 0 || age > 7) continue; // announced when it takes effect, for a week
        out.push({
          subscription_id: subId, payment_method_id: null, alert_type: "cost_increase", severity: "warning",
          title: `${sub.name} cost increased${c.percent != null ? ` ${c.percent}%` : ""}`,
          detail: `Monthly cost went from ${c.previous} to ${c.current} ${c.currency} on ${row.effective_from}.`,
          due_date: row.effective_from, reminder_days: null, dedupe_key: `cost_increase:${row.id}`,
        });
      }
    }
  }

  if (on("potential_duplicate")) {
    const seen = new Set<string>();
    for (const s of live) {
      const others = live.filter((o) => o.id !== s.id).map((o) => ({ id: o.id, name: o.name, vendor: o.vendor, productId: o.product_id }));
      for (const m of findPotentialDuplicates({ id: s.id, name: s.name, vendor: s.vendor, productId: s.product_id }, others)) {
        const [a, b] = [s.id, m.id].sort();
        const key = `potential_duplicate:${a}:${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          subscription_id: s.id, payment_method_id: null, alert_type: "potential_duplicate", severity: "info",
          title: `${s.name} may duplicate ${m.name}`, detail: m.reason,
          due_date: null, reminder_days: null, dedupe_key: key,
        });
      }
    }
  }

  return out;
}

export type OpenAlert = {
  id: string;
  alert_type: AlertType;
  subscription_id: string | null;
  payment_method_id: string | null;
  due_date: string | null;
};

const FORWARD_LOOKING: AlertType[] = ["renewal_approaching", "cancellation_deadline", "subscription_expiring", "payment_card_expiring", "cost_increase"];

/**
 * Open alerts that no longer describe a real situation, so they can be auto-resolved:
 * the subscription is archived/expired/gone, the card was retired, or a forward-looking date has passed.
 */
export function alertsToResolve(
  open: OpenAlert[],
  subscriptions: Pick<EngineSubscription, "id" | "status">[],
  cards: Pick<EngineCard, "id" | "retired_at">[],
  today: string,
): string[] {
  const sub = new Map(subscriptions.map((s) => [s.id, s]));
  const card = new Map(cards.map((c) => [c.id, c]));
  return open
    .filter((a) => {
      if (a.alert_type === "delivery_failure") return false;
      if (a.subscription_id) {
        const s = sub.get(a.subscription_id);
        if (!s || !isLiveStatus(s.status)) return true;
      }
      if (a.payment_method_id) {
        const c = card.get(a.payment_method_id);
        if (!c || c.retired_at) return true;
      }
      return FORWARD_LOOKING.includes(a.alert_type) && a.alert_type !== "cost_increase" && a.due_date != null && a.due_date < today;
    })
    .map((a) => a.id);
}
