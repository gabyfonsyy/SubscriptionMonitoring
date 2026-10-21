import { renewalRisk } from "@/domain/renewals";
import { expiryState, formatExpiry } from "@/domain/cards";
import { addDays } from "@/lib/date";

export type Severity = "high" | "medium" | "low";

export type AttentionKind =
  | "renewal_overdue"
  | "notice_passed"
  | "notice_deadline_soon"
  | "renewal_due_soon"
  | "card_expired"
  | "card_retired"
  | "card_expiring_soon"
  | "expiration_passed"
  | "no_price"
  | "no_owner"
  | "no_renewal_date";

export type AttentionItem = {
  subscriptionId: string;
  name: string;
  kind: AttentionKind;
  severity: Severity;
  message: string;
  /** Date the item is about (renewal, deadline, expiry), for sorting and display. */
  date: string | null;
};

export type AttentionSubscription = {
  id: string;
  name: string;
  status: string;
  billing_frequency: string;
  auto_renew: boolean | null;
  next_renewal_date: string | null;
  cancellation_notice_days: number | null;
  expiration_date: string | null;
  owner_id: string | null;
  current_amount: string | number | null;
  card_label: string | null;
  card_last_four: string | null;
  card_expiry_month: number | null;
  card_expiry_year: number | null;
  card_retired_at: string | null;
};

const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
export const NOTICE_WARNING_DAYS = 14;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Everything that needs a human, most urgent first. Archived and expired subscriptions are ignored.
 * Missing data is reported as such (never guessed).
 */
export function buildAttentionQueue(subs: AttentionSubscription[], today: string): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const s of subs) {
    if (s.status === "archived" || s.status === "expired") continue;
    const add = (kind: AttentionKind, severity: Severity, message: string, date: string | null = null) =>
      items.push({ subscriptionId: s.id, name: s.name, kind, severity, message, date });

    const willRenew = s.auto_renew !== false; // unknown is treated as "may renew"
    const risk = renewalRisk({ nextRenewalDate: s.next_renewal_date, cancellationNoticeDays: s.cancellation_notice_days, today });

    if (risk.level === "overdue") {
      add("renewal_overdue", "high", `Renewal date passed ${plural(Math.abs(risk.daysUntilRenewal!), "day")} ago. Update the date or status.`, s.next_renewal_date);
    } else if (risk.level === "notice_passed" && willRenew) {
      add("notice_passed", "high", `Cancellation window closed on ${risk.noticeDeadline}; renews in ${plural(risk.daysUntilRenewal!, "day")}.`, risk.noticeDeadline);
    } else if (willRenew && risk.daysUntilNoticeDeadline != null && risk.daysUntilNoticeDeadline >= 0 && risk.daysUntilNoticeDeadline <= NOTICE_WARNING_DAYS) {
      add("notice_deadline_soon", "high", `Last day to cancel is in ${plural(risk.daysUntilNoticeDeadline, "day")} (${risk.noticeDeadline}).`, risk.noticeDeadline);
    } else if (risk.daysUntilRenewal != null && risk.daysUntilRenewal >= 0 && risk.daysUntilRenewal <= 30) {
      add("renewal_due_soon", "medium", `Renews in ${plural(risk.daysUntilRenewal!, "day")}.`, s.next_renewal_date);
    }

    if (risk.level === "unknown" && s.billing_frequency !== "one_time") {
      add("no_renewal_date", "low", "No renewal date set, so renewals cannot be tracked.");
    }
    if (s.expiration_date && s.expiration_date < today) {
      add("expiration_passed", "medium", `Expired on ${s.expiration_date} but status is still ${s.status.replaceAll("_", " ")}.`, s.expiration_date);
    }
    if (s.current_amount == null && s.billing_frequency !== "one_time") {
      add("no_price", "medium", "No current price recorded.");
    }
    if (!s.owner_id) add("no_owner", "medium", "No internal owner assigned.");

    if (s.card_label) {
      const cardName = `${s.card_label} •••• ${s.card_last_four}`;
      if (s.card_retired_at) add("card_retired", "high", `Paid with a retired card (${cardName}). Move it to another card.`);
      else if (s.card_expiry_month && s.card_expiry_year) {
        const st = expiryState(s.card_expiry_month, s.card_expiry_year, today);
        const exp = formatExpiry(s.card_expiry_month, s.card_expiry_year);
        if (st === "expired") add("card_expired", "high", `Card ${cardName} expired ${exp}.`);
        else if (st === "expiring_soon") add("card_expiring_soon", "medium", `Card ${cardName} expires ${exp}.`);
      }
    }
  }

  return items.sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] ||
      (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31") ||
      a.name.localeCompare(b.name),
  );
}

export type RenewalEntry = { subscriptionId: string; name: string; renewalDate: string; noticeDeadline: string | null; autoRenew: boolean | null };

/** Renewals in the next `days` days, soonest first. Subscriptions set to not auto-renew are included (they still lapse). */
export function upcomingRenewals(
  subs: { id: string; name: string; status: string; next_renewal_date: string | null; cancellation_notice_days: number | null; auto_renew: boolean | null }[],
  today: string,
  days = 90,
): RenewalEntry[] {
  const end = addDays(today, days);
  return subs
    .filter((s) => s.status !== "archived" && s.status !== "expired" && s.next_renewal_date && s.next_renewal_date >= today && s.next_renewal_date <= end)
    .map((s) => ({
      subscriptionId: s.id,
      name: s.name,
      renewalDate: s.next_renewal_date!,
      noticeDeadline: s.cancellation_notice_days == null ? null : addDays(s.next_renewal_date!, -s.cancellation_notice_days),
      autoRenew: s.auto_renew,
    }))
    .sort((a, b) => a.renewalDate.localeCompare(b.renewalDate) || a.name.localeCompare(b.name));
}
