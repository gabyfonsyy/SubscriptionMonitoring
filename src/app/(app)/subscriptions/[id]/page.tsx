import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ConfirmAction } from "@/components/ui/confirm-dialog";
import { SubmitButton, inputCls } from "@/components/ui/form";
import { CriticalityBadge, RenewalBadge, StatusBadge } from "@/components/subscriptions/badges";
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
import { CostHistorySection } from "@/components/subscriptions/cost-history-section";
import { categoryLabel, frequencyLabel } from "@/domain/constants";
import { renewalRisk } from "@/domain/renewals";
import { todayISO } from "@/lib/date";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { AuditLogRow } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Subscription" };

export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ correct?: string }>;
}) {
  const { id } = await params;
  const { correct } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [user, sub] = await Promise.all([getCurrentUser(), getSubscription(id)]);
  if (!sub) notFound();

  const [history, docs, subAudit, duplicates] = await Promise.all([
    getCostHistory(id),
    getDocuments(id),
    getAuditTrail(id),
    sub.archived_at ? Promise.resolve([]) : findDuplicatesFor({ id, name: sub.name, vendor: sub.vendor }),
  ]);

  const [costAudit, rates] = await Promise.all([
    getCostAudit(history.map((h) => h.id)),
    new Set(history.map((h) => h.currency)).size > 1 ? listExchangeRates() : Promise.resolve([]),
  ]);
  // Price-record edits only matter when something other than the closing end date changed.
  const audit = [...subAudit, ...costAudit.filter(isPriceEdit)].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

  const today = todayISO();
  const archived = sub.status === "archived";
  const risk = renewalRisk({
    nextRenewalDate: sub.next_renewal_date,
    cancellationNoticeDays: sub.cancellation_notice_days,
    today,
  });
  const canEdit = !!user?.canEdit;

  return (
    <>
      <PageHeader
        title={sub.name}
        description={`${sub.vendor} · ${categoryLabel(sub.category)}`}
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              {!archived && (
                <Link href={`/subscriptions/${id}/edit`} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-background">
                  Edit
                </Link>
              )}
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
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={sub.status} />
        {!archived && <RenewalBadge risk={risk} />}
        <CriticalityBadge value={sub.criticality} />
      </div>

      {duplicates.length > 0 && (
        <div role="note" className="mb-4 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
          <span className="font-medium">Possible duplicate:</span>{" "}
          {duplicates.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <Link href={`/subscriptions/${d.id}`} className="underline">{d.name} ({d.vendor})</Link>
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Billing">
          <Item label="Current price">
            {sub.current_amount ? formatMoney(sub.current_amount, sub.current_currency) : <Badge glyph="?">No current price</Badge>}
          </Item>
          <Item label="Normalized monthly cost">
            {sub.current_normalized_monthly
              ? `${formatMoney(sub.current_normalized_monthly, sub.current_currency)} / month`
              : sub.current_frequency === "one_time"
                ? "One-time charge (not recurring)"
                : "—"}
          </Item>
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
        </Card>

        <Card title="Ownership">
          <Item label="Product / service">{sub.product_name ?? "—"}</Item>
          <Item label="Responsible team">{sub.team_name ?? "—"}</Item>
          <Item label="Internal owner">{sub.owner_name ?? <Badge glyph="?">Unassigned</Badge>}</Item>
          <Item label="Payment method">
            {sub.card_label ? (
              <>
                {sub.card_label} •••• {sub.card_last_four}{" "}
                {sub.card_retired_at && <Badge tone="warn" glyph="▲">Retired card</Badge>}
              </>
            ) : (
              "—"
            )}
          </Item>
          <Item label="Description">{sub.description ?? "—"}</Item>
          <Item label="Business purpose">{sub.business_purpose ?? "—"}</Item>
          <Item label="Notes">{sub.notes ?? "—"}</Item>
          <Item label="Created">{formatDateTime(sub.created_at)}</Item>
          <Item label="Last updated">{formatDateTime(sub.updated_at)}</Item>
        </Card>
      </div>

      <CostHistorySection
        subscriptionId={id}
        history={history}
        rates={rates}
        today={today}
        canEdit={canEdit}
        archived={archived}
        correctId={correct}
      />

      <Card title="Supporting documents" className="mt-4">
        {docs.length === 0 ? (
          <p className="text-sm text-muted">No documents linked.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">{d.title}</a>
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
      </Card>

      <Card title="Change history" className="mt-4">
        {audit.length === 0 ? (
          <p className="text-sm text-muted">No recorded changes.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {audit.map((a) => (
              <li key={a.id} className="py-2">
                <span className="font-medium capitalize">{a.entity_table === "subscription_cost_history" ? "Price record " : ""}{a.action}</span>{" "}
                <span className="text-muted">
                  by {a.actor_email ?? "system"} · {formatDateTime(a.occurred_at)}
                </span>
                <div className="text-xs text-muted">{summarizeChange(a)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
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
  return changed
    .map((k) => `${k.replaceAll("_", " ")}: ${fmt(before[k])} → ${fmt(after[k])}`)
    .join(" · ");
}
const fmt = (v: unknown) => (v == null || v === "" ? "empty" : String(v));

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-5 ${className ?? ""}`}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
