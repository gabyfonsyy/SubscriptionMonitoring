import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { AttentionList } from "@/components/subscriptions/attention-list";
import { listAllInventory } from "@/data/portfolio";
import { buildAttentionQueue, upcomingRenewals } from "@/domain/attention";
import { daysBetween, todayISO } from "@/lib/date";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Renewals & Alerts" };

export default async function Page() {
  const today = todayISO();
  const rows = await listAllInventory();
  const queue = buildAttentionQueue(rows, today);
  const renewals = upcomingRenewals(rows, today, 90);

  return (
    <>
      <PageHeader title="Renewals & Alerts" description="What needs action, and what renews in the next 90 days." />

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">Attention queue ({queue.length})</h2>
        {queue.length === 0 ? (
          <p className="text-sm text-muted">Nothing needs attention right now.</p>
        ) : (
          <AttentionList items={queue} />
        )}
      </section>

      <section className="mt-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">Renewal timeline: next 90 days ({renewals.length})</h2>
        {renewals.length === 0 ? (
          <p className="text-sm text-muted">No renewals in the next 90 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Upcoming renewals, soonest first</caption>
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Renews</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Subscription</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Auto-renew</th>
                  <th scope="col" className="py-2 font-medium">Cancel by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {renewals.map((r) => {
                  const left = daysBetween(today, r.renewalDate);
                  const noticeLeft = r.noticeDeadline ? daysBetween(today, r.noticeDeadline) : null;
                  return (
                    <tr key={r.subscriptionId}>
                      <td className="py-2 pr-4">
                        {formatDate(r.renewalDate)} <span className="text-xs text-muted">({left === 0 ? "today" : `in ${left} day${left === 1 ? "" : "s"}`})</span>
                      </td>
                      <td className="py-2 pr-4"><Link href={`/subscriptions/${r.subscriptionId}`} className="underline">{r.name}</Link></td>
                      <td className="py-2 pr-4">{r.autoRenew == null ? "Unknown" : r.autoRenew ? "Yes" : "No"}</td>
                      <td className="py-2">
                        {r.noticeDeadline ? (
                          <>
                            {formatDate(r.noticeDeadline)}{" "}
                            {noticeLeft != null && noticeLeft < 0 && r.autoRenew !== false && <Badge tone="danger" glyph="✕">Window closed</Badge>}
                            {noticeLeft != null && noticeLeft >= 0 && noticeLeft <= 14 && <Badge tone="warn" glyph="▲">{noticeLeft} day{noticeLeft === 1 ? "" : "s"} left</Badge>}
                          </>
                        ) : (
                          <span className="text-muted">No notice period set</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-3 text-xs text-muted">Google Chat notifications for these items arrive in Phase 8.</p>
    </>
  );
}
