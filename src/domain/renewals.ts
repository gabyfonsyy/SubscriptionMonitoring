import { addDays, daysBetween } from "@/lib/date";

export type RenewalRiskLevel =
  | "unknown" // no renewal date: we cannot tell, so we say so instead of guessing
  | "overdue"
  | "notice_passed" // cancellation window already closed, renewal still ahead
  | "due_soon" // within 30 days
  | "upcoming" // within 90 days
  | "ok";

export type RenewalRisk = {
  level: RenewalRiskLevel;
  daysUntilRenewal: number | null;
  noticeDeadline: string | null;
  daysUntilNoticeDeadline: number | null;
};

export function renewalRisk(input: {
  nextRenewalDate: string | null;
  cancellationNoticeDays: number | null;
  today: string;
}): RenewalRisk {
  const { nextRenewalDate, cancellationNoticeDays, today } = input;
  if (!nextRenewalDate) {
    return { level: "unknown", daysUntilRenewal: null, noticeDeadline: null, daysUntilNoticeDeadline: null };
  }

  const daysUntilRenewal = daysBetween(today, nextRenewalDate);
  const noticeDeadline =
    cancellationNoticeDays == null ? null : addDays(nextRenewalDate, -cancellationNoticeDays);
  const daysUntilNoticeDeadline = noticeDeadline == null ? null : daysBetween(today, noticeDeadline);

  let level: RenewalRiskLevel;
  if (daysUntilRenewal < 0) level = "overdue";
  else if (daysUntilNoticeDeadline != null && daysUntilNoticeDeadline < 0) level = "notice_passed";
  else if (daysUntilRenewal <= 30) level = "due_soon";
  else if (daysUntilRenewal <= 90) level = "upcoming";
  else level = "ok";

  return { level, daysUntilRenewal, noticeDeadline, daysUntilNoticeDeadline };
}
