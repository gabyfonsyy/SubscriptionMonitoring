import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { CostChart, type ChartMark, type ChartPoint } from "@/components/subscriptions/cost-chart";
import { CorrectRecordForm, RecordPriceForm } from "@/components/subscriptions/price-forms";
import { correctCostRecordAction, recordPriceChangeAction } from "@/app/(app)/subscriptions/actions";
import { convertSeries, monthlySeries, priceChanges, type PriceChange } from "@/domain/cost-history";
import { frequencyLabel } from "@/domain/constants";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { table, tableWrap, tbody, td, tdRight, th, thRight, thead, tr } from "@/components/ui/table";
import type { CostHistoryRow, ExchangeRateRow } from "@/lib/supabase/database.types";

const ANNOTATION = {
  increase: { label: "Increase", tone: "warn", glyph: "▲" },
  decrease: { label: "Decrease", tone: "ok", glyph: "▼" },
  discount: { label: "Discount", tone: "ok", glyph: "▼" },
  plan_change: { label: "Plan change", tone: "violet", glyph: "◆" },
} as const;

const MARK_TONE = { warn: "warn", ok: "ok", violet: "violet" } as const;
const signed = (n: string) => (n.startsWith("-") ? n : `+${n}`);

export function CostHistorySection({
  subscriptionId,
  history,
  rates,
  today,
  canEdit,
  archived,
  correctId,
  currentId,
  recordOpen = false,
}: {
  subscriptionId: string;
  history: CostHistoryRow[]; // newest first
  rates: ExchangeRateRow[];
  today: string;
  canEdit: boolean;
  archived: boolean;
  correctId?: string;
  /** The record whose period contains today. */
  currentId?: string;
  recordOpen?: boolean;
}) {
  const changes = priceChanges(history);
  const latest = history[0]; // newest first, may be future-dated
  const current = history.find((h) => h.id === currentId);
  const target = (current ?? latest)?.currency;
  const mixed = new Set(history.map((h) => h.currency)).size > 1;

  const series = target ? convertSeries(monthlySeries(history, today), target, rates) : [];
  const points: ChartPoint[] = series.map((p) => ({
    month: p.month,
    value: p.converted == null ? null : Number(p.converted),
    scheduled: p.scheduled,
    note: p.note,
  }));
  const gaps = series.filter((p) => p.amount != null && p.converted == null && p.note);
  const hasRecurring = points.some((p) => p.value != null);

  const marks: ChartMark[] = [];
  for (const [from, c] of changes) {
    if ("note" in c || !c.annotation) continue;
    const a = ANNOTATION[c.annotation];
    marks.push({
      month: `${from.slice(0, 7)}-01`,
      label: c.percent != null && c.annotation !== "plan_change" ? `${a.label} ${signed(c.percent)}%` : a.label,
      tone: MARK_TONE[a.tone],
    });
  }

  const basis = current ?? latest;
  const defaults = {
    currency: basis?.currency ?? "USD",
    billing_frequency: basis?.billing_frequency ?? "monthly",
    cycle_months: String(basis?.cycle_months ?? ""),
  };
  const correcting = canEdit ? history.find((h) => h.id === correctId) : undefined;

  return (
    <div className="space-y-5">
      {hasRecurring && target && (
        <Panel
          title="Normalized monthly cost"
          description={`In ${target}${mixed ? ". Earlier prices in other currencies are converted at the rate in effect at that date" : ""}.`}
        >
          <CostChart points={points} marks={marks} currency={target} />
          {gaps.length > 0 && (
            <p role="note" className="mt-3 rounded-md border border-warn/30 bg-warn-wash p-2.5 text-xs text-warn">
              {gaps.length} month{gaps.length === 1 ? "" : "s"} could not be shown in {target}: {gaps[0].note} Add the missing rate in{" "}
              <Link href="/settings" className="underline">Settings</Link>.
            </p>
          )}
        </Panel>
      )}

      <Panel title="Billing amount timeline" description="Every price this subscription has had, newest first. Nothing is overwritten." flush>
        {history.length === 0 ? (
          <p className="p-5 text-sm text-muted">No prices recorded yet.</p>
        ) : (
          <div className={tableWrap}>
            <table className={`${table} min-w-[820px]`}>
              <caption className="sr-only">Billing amount timeline, newest first</caption>
              <thead className={thead}>
                <tr>
                  <th scope="col" className={th}>Effective</th>
                  <th scope="col" className={thRight}>Billed</th>
                  <th scope="col" className={thRight}>Monthly</th>
                  <th scope="col" className={th}>Change vs previous</th>
                  <th scope="col" className={th}>Reason</th>
                  <th scope="col" className={th}>Recorded</th>
                </tr>
              </thead>
              <tbody className={tbody}>
                {history.map((h) => {
                  const c = changes.get(h.effective_from);
                  const isCurrent = h.id === currentId;
                  const isScheduled = h.effective_from > today;
                  return (
                    <tr key={h.id} className={`${tr} align-top ${isCurrent ? "bg-accent-wash/50" : ""}`}>
                      <td className={`${td} num`}>
                        <div>{formatDate(h.effective_from)} → {h.effective_to ? formatDate(h.effective_to) : "ongoing"}</div>
                        <div className="mt-1 flex gap-1.5">
                          {isCurrent && <Badge tone="ok" glyph="●">Current</Badge>}
                          {isScheduled && <Badge tone="blue" glyph="◷">Scheduled</Badge>}
                        </div>
                      </td>
                      <td className={tdRight}>
                        <div>{formatMoney(h.amount, h.currency)}</div>
                        <div className="text-xs text-muted">{frequencyLabel(h.billing_frequency)}</div>
                      </td>
                      <td className={tdRight}>{h.normalized_monthly ? formatMoney(h.normalized_monthly, h.currency) : "—"}</td>
                      <td className={td}>
                        <ChangeCell change={c} type={h.change_type} />
                      </td>
                      <td className={`${td} max-w-56 text-muted`}>{h.reason ?? "—"}</td>
                      <td className={`${td} text-muted`}>
                        <div className="num text-xs">{formatDateTime(h.recorded_at)}</div>
                        {canEdit && (
                          <Link href={correctId === h.id ? `/subscriptions/${subscriptionId}?tab=cost` : `/subscriptions/${subscriptionId}?tab=cost&correct=${h.id}`} className="text-xs font-medium text-accent hover:underline">
                            {correctId === h.id ? "Cancel correction" : "Correct"}
                          </Link>
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

      {correcting && (
        <Panel title={`Correct the price effective ${formatDate(correcting.effective_from)}`} description="Use this for mistakes in a recorded price. For a real price change, record a new one so the history stays accurate. The edit is audited.">
          <CorrectRecordForm
            key={correcting.id}
            action={correctCostRecordAction.bind(null, subscriptionId, correcting.id)}
            initial={{
              amount: String(Number(correcting.amount)),
              currency: correcting.currency,
              billing_frequency: correcting.billing_frequency,
              cycle_months: String(correcting.cycle_months ?? ""),
            }}
          />
        </Panel>
      )}

      {canEdit && !archived && (
        <details id="record" className="rounded-lg border border-border bg-surface shadow-sm" open={recordOpen || history.length === 0}>
          <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold">Record cost change</summary>
          <div className="border-t border-border p-5">
            <p className="mb-3 text-xs text-muted">Adds a new price period; the previous one is closed the day before. Future dates are fine.</p>
            <RecordPriceForm action={recordPriceChangeAction.bind(null, subscriptionId)} defaults={defaults} />
          </div>
        </details>
      )}
    </div>
  );
}

function ChangeCell({ change, type }: { change: PriceChange | { note: string } | undefined; type: string }) {
  if (!change) return <span className="text-muted">{type === "initial" ? "Initial price" : "—"}</span>;
  if ("note" in change) return <span className="text-xs text-muted">{change.note}</span>;
  const a = change.annotation ? ANNOTATION[change.annotation] : null;
  const zero = Number(change.absolute) === 0;
  return (
    <div className="space-y-1">
      <div className="num">
        {zero
          ? "No change"
          : `${change.absolute.startsWith("-") ? "−" : "+"}${formatMoney(change.absolute.replace("-", ""), change.currency)} / mo`}
        {change.percent != null && !zero && <span className="text-muted"> ({signed(change.percent)}%)</span>}
      </div>
      {a && (
        <Badge tone={a.tone} glyph={a.glyph}>
          {a.label}
        </Badge>
      )}
    </div>
  );
}
