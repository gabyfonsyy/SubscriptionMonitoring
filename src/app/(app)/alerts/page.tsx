import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, EmptyState } from "@/components/ui/panel";
import { Badge, Status, type Tone } from "@/components/ui/badge";
import { LinkTabs } from "@/components/ui/tabs";
import { SubmitButton } from "@/components/ui/form";
import { AttentionList } from "@/components/subscriptions/attention-list";
import { countAlertsByStatus, listAlerts, listDeliveries, ALERT_PAGE_SIZE } from "@/data/alerts";
import { listAllInventory } from "@/data/portfolio";
import { getCurrentUser } from "@/lib/auth";
import { buildAttentionQueue, upcomingRenewals } from "@/domain/attention";
import { daysBetween, todayISO } from "@/lib/date";
import { formatDate, formatDateTime } from "@/lib/format";
import { setAlertStatusAction } from "./actions";
import { table, tableWrap, tbody, td, th, thead, tr } from "@/components/ui/table";
import type { AlertSeverity, AlertStatus } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Renewals & Alerts" };

type SP = { tab?: string; status?: string; notice?: string };
const TABS = ["attention", "alerts", "renewals", "log"] as const;
type Tab = (typeof TABS)[number];
const STATUS_FILTERS: (AlertStatus | "all")[] = ["open", "acknowledged", "resolved", "all"];

const SEV: Record<AlertSeverity, { label: string; tone: Tone }> = {
  critical: { label: "Critical", tone: "danger" },
  warning: { label: "Warning", tone: "warn" },
  info: { label: "Info", tone: "info" },
};
const NOTICES: Record<string, string> = {
  forbidden: "Only editors and admins can change alerts.",
  failed: "The alert could not be updated. It may have been removed.",
};

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "attention";
  const status = (STATUS_FILTERS as string[]).includes(sp.status ?? "") ? (sp.status as AlertStatus | "all") : "open";

  const today = todayISO();
  const [user, rows, counts] = await Promise.all([getCurrentUser(), listAllInventory(), countAlertsByStatus()]);
  const queue = buildAttentionQueue(rows, today);
  const renewals = upcomingRenewals(rows, today, 90);
  const canEdit = !!user?.canEdit;

  const tabs = [
    { key: "attention", label: "Attention", href: "/alerts", count: queue.length },
    { key: "alerts", label: "Alerts", href: "/alerts?tab=alerts", count: counts.open },
    { key: "renewals", label: "Renewals", href: "/alerts?tab=renewals", count: renewals.length },
    ...(canEdit ? [{ key: "log", label: "Delivery log", href: "/alerts?tab=log" }] : []),
  ];

  return (
    <>
      <PageHeader title="Renewals & Alerts" description="What needs action now, the alerts sent to Google Chat, and what renews next." />
      {sp.notice && NOTICES[sp.notice] && (
        <p role="alert" className="mb-4 rounded-md border border-warn/30 bg-warn-wash p-3 text-sm text-warn">{NOTICES[sp.notice]}</p>
      )}
      <LinkTabs tabs={tabs} active={tab} label="Alerts sections" />

      {tab === "attention" && (
        <Panel title={`Needs attention (${queue.length})`} description="Calculated live from your data. Fix the cause and an item disappears.">
          {queue.length === 0 ? <p className="text-sm text-muted">Nothing needs attention right now.</p> : <AttentionList items={queue} />}
        </Panel>
      )}

      {tab === "alerts" && <AlertsTab status={status} counts={counts} canEdit={canEdit} />}

      {tab === "renewals" && (
        <Panel title={`Next 90 days (${renewals.length})`} flush>
          {renewals.length === 0 ? (
            <p className="p-5 text-sm text-muted">No renewals in the next 90 days.</p>
          ) : (
            <div className={tableWrap}>
              <table className={`${table} min-w-[560px]`}>
                <caption className="sr-only">Upcoming renewals, soonest first</caption>
                <thead className={thead}>
                  <tr>
                    <th scope="col" className={th}>Renews</th>
                    <th scope="col" className={th}>Subscription</th>
                    <th scope="col" className={th}>Auto-renew</th>
                    <th scope="col" className={th}>Cancel by</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {renewals.map((r) => {
                    const left = daysBetween(today, r.renewalDate);
                    const noticeLeft = r.noticeDeadline ? daysBetween(today, r.noticeDeadline) : null;
                    return (
                      <tr key={r.subscriptionId} className={tr}>
                        <td className={`${td} num`}>
                          {formatDate(r.renewalDate)} <span className="text-xs text-muted">({left === 0 ? "today" : `in ${left}d`})</span>
                        </td>
                        <td className={td}><Link href={`/subscriptions/${r.subscriptionId}`} className="font-medium hover:underline">{r.name}</Link></td>
                        <td className={td}>{r.autoRenew == null ? "Unknown" : r.autoRenew ? "Yes" : "No"}</td>
                        <td className={`${td} num`}>
                          {r.noticeDeadline ? (
                            <>
                              {formatDate(r.noticeDeadline)}{" "}
                              {noticeLeft != null && noticeLeft < 0 && r.autoRenew !== false && <Badge tone="danger" glyph="✕">Window closed</Badge>}
                              {noticeLeft != null && noticeLeft >= 0 && noticeLeft <= 14 && <Badge tone="warn" glyph="▲">{noticeLeft}d left</Badge>}
                            </>
                          ) : (
                            <span className="text-muted">No notice period</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "log" && canEdit && <DeliveryLog />}
    </>
  );
}

async function AlertsTab({ status, counts, canEdit }: { status: AlertStatus | "all"; counts: Record<AlertStatus, number>; canEdit: boolean }) {
  const alerts = await listAlerts(status);
  const filters: { key: AlertStatus | "all"; label: string; n?: number }[] = [
    { key: "open", label: "Open", n: counts.open },
    { key: "acknowledged", label: "Acknowledged", n: counts.acknowledged },
    { key: "resolved", label: "Resolved", n: counts.resolved },
    { key: "all", label: "All" },
  ];

  return (
    <Panel
      title="Alerts"
      description="Created by the daily check and sent to Google Chat. Acknowledge when someone is on it; resolve when it is dealt with."
      actions={
        <nav aria-label="Filter by status" className="flex gap-1 text-xs">
          {filters.map((f) => (
            <Link
              key={f.key}
              href={`/alerts?tab=alerts&status=${f.key}`}
              aria-current={status === f.key ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 font-medium ${status === f.key ? "bg-accent-wash text-accent" : "text-muted hover:bg-surface-2"}`}
            >
              {f.label}
              {f.n != null && <span className="num ml-1 text-faint">{f.n}</span>}
            </Link>
          ))}
        </nav>
      }
    >
      {alerts.length === 0 ? (
        <EmptyState title={status === "open" ? "No open alerts" : "No alerts here"}>
          {status === "open" ? "The daily check has nothing for you to act on." : "Nothing matches this filter."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {alerts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={SEV[a.severity].tone}>{SEV[a.severity].label}</Badge>
                  {a.subscription_id ? (
                    <Link href={`/subscriptions/${a.subscription_id}`} className="font-medium hover:underline">{a.title}</Link>
                  ) : a.payment_method_id ? (
                    <Link href="/payment-methods" className="font-medium hover:underline">{a.title}</Link>
                  ) : (
                    <span className="font-medium">{a.title}</span>
                  )}
                </p>
                {a.detail && <p className="mt-0.5 text-xs text-muted">{a.detail}</p>}
                <p className="num mt-1 text-xs text-faint">
                  Raised {formatDateTime(a.created_at)}
                  {a.due_date && <> · due {formatDate(a.due_date)}</>}
                  {a.status === "acknowledged" && a.acknowledged_at && <> · acknowledged {formatDateTime(a.acknowledged_at)}{a.acknowledged_by_name ? ` by ${a.acknowledged_by_name}` : ""}</>}
                  {a.status === "resolved" && a.resolved_at && <> · resolved {formatDateTime(a.resolved_at)}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Status tone={a.status === "open" ? "warn" : a.status === "acknowledged" ? "info" : "ok"}>
                  {a.status === "open" ? "Open" : a.status === "acknowledged" ? "Acknowledged" : "Resolved"}
                </Status>
                {canEdit && (
                  <>
                    {a.status === "open" && <Act id={a.id} next="acknowledged" label="Acknowledge" status={status} />}
                    {a.status !== "resolved" && <Act id={a.id} next="resolved" label="Resolve" status={status} primary />}
                    {a.status === "resolved" && <Act id={a.id} next="open" label="Reopen" status={status} />}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {alerts.length === ALERT_PAGE_SIZE && <p className="mt-3 text-xs text-muted">Showing the {ALERT_PAGE_SIZE} most recent.</p>}
    </Panel>
  );
}

function Act({ id, next, label, status, primary = false }: { id: string; next: string; label: string; status: string; primary?: boolean }) {
  return (
    <form action={setAlertStatusAction.bind(null, id, next)}>
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={primary ? "primary" : "secondary"} pendingText="…" className="h-8 px-2.5 text-xs">{label}</SubmitButton>
    </form>
  );
}

async function DeliveryLog() {
  const log = await listDeliveries(50);
  const failed = log.filter((d) => d.status === "failed").length;
  return (
    <Panel
      title="Delivery log"
      description="Every attempt to send an alert to Google Chat. A failed alert is retried on later runs, up to 3 attempts."
      actions={failed > 0 ? <Badge tone="warn" glyph="▲">{failed} failed in the last {log.length}</Badge> : undefined}
      flush
    >
      {log.length === 0 ? (
        <p className="p-5 text-sm text-muted">Nothing has been sent yet. Use Settings → Notifications → Run alert check now.</p>
      ) : (
        <div className={tableWrap}>
          <table className={`${table} min-w-[640px]`}>
            <caption className="sr-only">Notification delivery attempts, newest first</caption>
            <thead className={thead}>
              <tr>
                <th scope="col" className={th}>When</th>
                <th scope="col" className={th}>Alert</th>
                <th scope="col" className={th}>Result</th>
                <th scope="col" className={th}>Attempt</th>
                <th scope="col" className={th}>Detail</th>
              </tr>
            </thead>
            <tbody className={tbody}>
              {log.map((d) => (
                <tr key={d.id} className={tr}>
                  <td className={`${td} num whitespace-nowrap text-muted`}>{formatDateTime(d.attempted_at)}</td>
                  <td className={td}>{d.alert_title ?? "(alert removed)"}</td>
                  <td className={td}>
                    <Status tone={d.status === "sent" ? "ok" : d.status === "failed" ? "danger" : "neutral"}>
                      {d.status === "sent" ? "Sent" : d.status === "failed" ? "Failed" : "Skipped"}
                    </Status>
                  </td>
                  <td className={`${td} num`}>{d.attempt}</td>
                  <td className={`${td} text-xs text-muted`}>{d.error_message ?? (d.http_status ? `HTTP ${d.http_status}` : "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
