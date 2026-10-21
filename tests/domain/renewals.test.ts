import { describe, expect, it } from "vitest";
import { renewalRisk } from "@/domain/renewals";
import { addDays, daysBetween, isValidISODate, todayISO } from "@/lib/date";

const today = "2026-10-20";

describe("renewalRisk", () => {
  it("says unknown (not low risk) when there is no renewal date", () => {
    expect(renewalRisk({ nextRenewalDate: null, cancellationNoticeDays: 30, today }).level).toBe("unknown");
  });
  it("flags overdue renewals", () => {
    expect(renewalRisk({ nextRenewalDate: "2026-10-01", cancellationNoticeDays: null, today }).level).toBe("overdue");
  });
  it("computes the cancellation notice deadline", () => {
    const r = renewalRisk({ nextRenewalDate: "2026-12-01", cancellationNoticeDays: 30, today });
    expect(r.noticeDeadline).toBe("2026-11-01");
    expect(r.daysUntilNoticeDeadline).toBe(12);
    expect(r.level).toBe("upcoming");
  });
  it("flags a passed notice window while renewal is still ahead", () => {
    const r = renewalRisk({ nextRenewalDate: "2026-11-10", cancellationNoticeDays: 30, today });
    expect(r.level).toBe("notice_passed");
  });
  it("buckets by distance", () => {
    expect(renewalRisk({ nextRenewalDate: "2026-11-05", cancellationNoticeDays: null, today }).level).toBe("due_soon");
    expect(renewalRisk({ nextRenewalDate: "2027-01-10", cancellationNoticeDays: null, today }).level).toBe("upcoming");
    expect(renewalRisk({ nextRenewalDate: "2027-06-01", cancellationNoticeDays: null, today }).level).toBe("ok");
  });
  it("treats a renewal today as due soon, not overdue", () => {
    expect(renewalRisk({ nextRenewalDate: today, cancellationNoticeDays: null, today }).level).toBe("due_soon");
  });
});

describe("date helpers", () => {
  it("does date math across month and leap boundaries", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-10-20", "2026-12-01")).toBe(42);
  });
  it("validates ISO dates", () => {
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-10-20")).toBe(true);
    expect(isValidISODate("10/20/2026")).toBe(false);
  });
  it("reports today in the Manila timezone", () => {
    // 2026-10-20 17:00 UTC is already Oct 21 in Manila (UTC+8).
    expect(todayISO("Asia/Manila", new Date("2026-10-20T17:00:00Z"))).toBe("2026-10-21");
  });
});
