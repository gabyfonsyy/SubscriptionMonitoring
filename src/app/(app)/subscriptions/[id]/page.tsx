import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, EmptyState } from "@/components/ui/panel";
import { Badge, Status } from "@/components/ui/badge";
import { LinkTabs } from "@/components/ui/tabs";
import { LinkButton } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-dialog";
import { SubmitButton, inputCls } from "@/components/ui/form";
import { CriticalityBadge, RenewalBadge, StatusBadge } from "@/components/subscriptions/badges";
import { AttentionList } from "@/components/subscriptions/attention-list";
import { CostHistorySection } from "@/components/subscriptions/cost-history-section";
import {
  addDocumentAction,
  archiveSubscriptionAction,
  removeDocumentAction,
  restoreSubscriptionAction,
} from "../actions";
import { getCurrentUser } from "@/lib/auth";
import {
  findDuplicatesFor,
  getAuditTrail,
  getCostAudit,
  getCostHistory,
  getDocuments,
  getSubscription,
} from "@/data/subscriptions";
import { listExchangeRates } from "@/data/exchange-rates";
import { listAlertsForSubscription } from "@/data/alerts";
import { buildAttentionQueue } from "@/domain/attention";
import { categoryLabel, frequencyLabel } from "@/domain/constants";
import { renewalRisk } from "@/domain/renewals";
import { priceAt } from "@/domain/cost-history";
import { todayISO } from "@/lib/date";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { AuditLogRow } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Subscription" };

const TABS = ["overview", "cost", "alerts", "activity"] as const;
type Tab = (typeof TABS)[number];

export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ correct?: string; tab?: string; record?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [user, sub] = await Promise.all([getCurrentUser(), getSubscription(id)]);
  if (!sub) notFound();

  const [history, docs, subAudit, duplicates, persisted] = await Promise.all([
    getCostHistory(id),
    getDocuments(id),
    getAuditTrail(id),
    sub.archived_at ? Promise.resolve([]) : findDuplicatesFor({ id, name: sub.name, vendor: sub.vendor }),
    listAlertsForSubscription(id),
  ]);
  const [costAudit, rates] = await Promise.all([
    getCostAudit(history.map((h) => h.id)),
    new Set(history.map((h) => h.currency)).size > 1 ? listExchangeRates() : Promise.resolve([]),
  ]);
  // Price-record edits only matter when something other than the closing end date changed.
  const audit = [...subAudit, ...costAudit.filter(isPriceEdit)].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

  const today = todayISO();
  const archived = sub.status === "archived";
  const risk = renewalRisk({ nextRenewalDate: sub.next_renewal_date, cancellationNoticeDays: sub.cancellation_notice_days, today });
  const canEdit = !!user?.canEdit;
  const attention = buildAttentionQueue([sub], today);
  const openAlerts = persisted.filter((a) => a.status !== "resolved").length;
  const scheduled = history.filter((h) => h.effective_from > today).sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))[0];
  const current = priceAt(history, today);

  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : sp.correct || sp.record ? "cost" : "overview";
  const base = `/subscriptions/${id}`;
  const tabs = [
    { key: "overview", label: "Overview", href: base },
    { key: "cost", label: "Cost history", href: `${base}?tab=cost`, count: history.length },
    { key: "alerts", label: "Renewals & alerts", href: `${base}?tab=alerts`, count: attention.length + openAlerts },
    { key: "activity", label: "Activity log", href: `${base}?tab=activity` },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Subscriptions", href: "/subscriptions" }, { label: sub.name }]}
        title={sub.name}
        description={`${sub.vendor} · ${categoryLabel(sub.category)}`}
        actions={
          canEdit ? (
            <>
              <LinkButton href={`${base}?tab=cost&record=1#record`} variant="secondary">Record cost change</LinkButton>
              {!archived && <LinkButton href={`${base}/edit`}>Edit</LinkButton>}
              {archived ? (
                <ConfirmAction
                  action={restoreSubscriptionAction.bind(null, id)}
                  trigger="Restore"
                  title="Restore this subscription?"
                  description="It returns to Active status and appears in the inventory and reports again."
                  confirmLabel="Restore"
                />
              ) : (
                <ConfirmAction
                  action={archiveSubscriptionAction.bind(null, id)}
                  trigger="Archive"
                  title="Archive this subscription?"
                  description="It is hidden from the default inventory view, but its cost history and audit trail are kept and it still appears in historical reports. You can restore it later."
                  confirmLabel="Archive"
                  danger
                />
              )}
            </>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={sub.status} />
        {!archived && <RenewalBadge risk={risk} />}
        <CriticalityBadge value={sub.criticality} />
      </div>

      {duplicates.length > 0 && (
        <div role="note" className="mb-4 rounded-md border border-warn/30 bg-warn-wash p-3 text-sm text-warn">
          <span className="font-medium">Possible duplicate:</span>{" "}
          {duplicates.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <Link href={`/subscriptions/${d.id}`} className="underline">{d.name} ({d.vendor})</Link>
            </span>
          ))}
        </div>
      )}

      <section aria-label="Summary" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Current price">
          {sub.current_amount ? (
            <>
              <span className="num text-xl font-semibold tracking-tight">{formatMoney(sub.current_amount, sub.current_currency)}</span>
              <span className="text-xs text-muted">{frequencyLabel(sub.current_frequency)}</span>
              {scheduled && (
                <span className="text-xs text-info">
                  <span aria-hidden>◷ </span>
                  {formatMoney(scheduled.amount, scheduled.currency)} from {formatDate(scheduled.effective_from)}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-warn">No current price</span>
          )}
        </Tile>
        <Tile label="Normalized monthly">
          {sub.current_normalized_monthly ? (
            <>
              <span className="num text-xl font-semibold tracking-tight">{formatMoney(sub.current_normalized_monthly, sub.current_currency)}</span>
              <span className="text-xs text-muted">per month</span>
            </>
          ) : (
            <span className="text-sm text-muted">{sub.current_frequency === "one_time" ? "One-time charge" : "—"}</span>
          )}
        </Tile>
        <Tile label="Next renewal">
          <span className="num text-xl font-semibold tracking-tight">{formatDate(sub.next_renewal_date)}</span>
          <span className="text-xs text-muted">
            {risk.daysUntilRenewal == null ? "No date set" : risk.daysUntilRenewal < 0 ? `${Math.abs(risk.daysUntilRenewal)} days ago` : `in ${risk.daysUntilRenewal} days`} ·{" "}
            {sub.auto_renew == null ? "auto-renew unknown" : sub.auto_renew ? "auto-renews" : "does not auto-renew"}
          </span>
        </Tile>
        <Tile label="Payment method">
          {sub.card_label ? (
            <>
              <span className="text-sm font-medium">{sub.card_label}</span>
              <span className="num text-xs text-muted">•••• {sub.card_last_four}</span>
              {sub.card_retired_at && <Badge tone="warn" glyph="▲">Retired card</Badge>}
            </>
          ) : (
            <span className="text-sm text-muted">Not set</span>
          )}
        </Tile>
      </section>

      <LinkTabs tabs={tabs} active={tab} label="Subscription sections" />

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Billing">
              <Item label="Billing frequency">{frequencyLabel(sub.billing_frequency)}</Item>
              <Item label="Next billing date">{formatDate(sub.next_billing_date)}</Item>
              <Item label="Next renewal date">{formatDate(sub.next_renewal_date)}</Item>
              <Item label="Cancellation notice">
                {sub.cancellation_notice_days == null
                  ? "—"
                  : `${sub.cancellation_notice_days} days${risk.noticeDeadline ? ` (deadline ${formatDate(risk.noticeDeadline)})` : ""}`}
              </Item>
              <Item label="Auto-renewal">{sub.auto_renew == null ? "Unknown" : sub.auto_renew ? "Yes" : "No"}</Item>
              <Item label="Start date">{formatDate(sub.start_date)}</Item>
              <Item label="Expiration date">{formatDate(sub.expiration_date)}</Item>
              <Item label="Cost center">{sub.cost_center ?? "—"}</Item>
            </Panel>

            <Panel title="Ownership & context">
              <Item label="Product / service">{sub.product_name ?? "—"}</Item>
              <Item label="Responsible team">{sub.team_name ?? "—"}</Item>
              <Item label="Internal owner">{sub.owner_name ?? <Badge tone="warn" glyph="?">Unassigned</Badge>}</Item>
              <Item label="Description">{sub.description ?? "—"}</Item>
              <Item label="Business purpose">{sub.business_purpose ?? "—"}</Item>
              <Item label="Notes">{sub.notes ?? "—"}</Item>
              <Item label="Created">{formatDateTime(sub.created_at)}</Item>
              <Item label="Last updated">{formatDateTime(sub.updated_at)}</Item>
            </Panel>
          </div>

          <Panel title="Supporting documents" description="Links only. The documents themselves stay where they are.">
            {docs.length === 0 ? (
              <p className="text-sm text-muted">No documents linked.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">{d.title}</a>
                    {canEdit && (
                      <ConfirmAction
                        action={removeDocumentAction.bind(null, id, d.id)}
                        trigger="Remove"
                        title="Remove this link?"
                        description="Only the link is removed from this page; the document itself is not touched."
                        confirmLabel="Remove"
                        danger
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <form action={addDocumentAction.bind(null, id)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <input name="title" required placeholder="Title (e.g. Invoice Oct 2026)" aria-label="Document title" className={inputCls} />
                <input name="url" type="url" required placeholder="https://…" aria-label="Document link" className={inputCls} />
                <SubmitButton variant="secondary" pendingText="Adding…">Add link</SubmitButton>
              </form>
            )}
          </Panel>
        </div>
      )}

      {tab === "cost" && (
        <CostHistorySection
          subscriptionId={id}
          history={history}
          rates={rates}
          today={today}
          canEdit={canEdit}
          archived={archived}
          correctId={sp.correct}
          recordOpen={sp.record === "1"}
          currentId={current ? history.find((h) => h.effective_from === current.effective_from)?.id : undefined}
        />
      )}

      {tab === "alerts" && (
        <div className="space-y-5">
          <Panel title="Needs attention" description="Calculated live for this subscription.">
            {attention.length === 0 ? <p className="text-sm text-muted">Nothing needs attention.</p> : <AttentionList items={attention} />}
          </Panel>
          <Panel title="Alerts sent" description="Raised by the daily check. Manage them from Renewals & Alerts.">
            {persisted.length === 0 ? (
              <p className="text-sm text-muted">No alerts have been raised for this subscription.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {persisted.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                    <div>
                      <p className="font-medium">{a.title}</p>
                      {a.detail && <p className="text-xs text-muted">{a.detail}</p>}
                      <p className="num text-xs text-faint">Raised {formatDateTime(a.created_at)}</p>
                    </div>
                    <Status tone={a.status === "open" ? "warn" : a.status === "acknowledged" ? "info" : "ok"}>
                      {a.status === "open" ? "Open" : a.status === "acknowledged" ? "Acknowledged" : "Resolved"}
                    </Status>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/alerts?tab=alerts" className="mt-3 inline-block text-xs font-medium text-accent hover:underline">All alerts →</Link>
          </Panel>
        </div>
      )}

      {tab === "activity" && (
        <Panel title="Change history" description="Who changed what, newest first. Nothing here can be edited or removed.">
          {audit.length === 0 ? (
            <EmptyState title="No recorded changes" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {audit.map((a) => (
                <li key={a.id} className="py-2.5">
                  <span className="font-medium capitalize">{a.entity_table === "subscription_cost_history" ? "Price record " : ""}{a.action}</span>{" "}
                  <span className="text-muted">
                    by {a.actor_email ?? "system"} · <span className="num">{formatDateTime(a.occurred_at)}</span>
                  </span>
                  <div className="text-xs text-muted">{summarizeChange(a)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  );
}

const PRICE_KEYS = ["amount", "currency", "billing_frequency", "reason"];
function isPriceEdit(a: AuditLogRow): boolean {
  const before = (a.before_data ?? {}) as Record<string, unknown>;
  const after = (a.after_data ?? {}) as Record<string, unknown>;
  return PRICE_KEYS.some((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

const IGNORED_KEYS = new Set(["updated_at", "updated_by", "created_at", "created_by"]);

function summarizeChange(a: AuditLogRow): string {
  const before = (a.before_data ?? {}) as Record<string, unknown>;
  const after = (a.after_data ?? {}) as Record<string, unknown>;
  if (a.action === "insert") return "Record created.";
  const changed = Object.keys(after).filter((k) => !IGNORED_KEYS.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (changed.length === 0) return "No field changes.";
  return changed.map((k) => `${k.replaceAll("_", " ")}: ${fmt(before[k])} → ${fmt(after[k])}`).join(" · ");
}
const fmt = (v: unknown) => (v == null || v === "" ? "empty" : String(v));

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      {children}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/70 py-2 text-sm first:pt-0 last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
