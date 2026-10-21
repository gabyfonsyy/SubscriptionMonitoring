import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CostChart, type ChartMark, type ChartPoint } from "@/components/subscriptions/cost-chart";
import { CorrectRecordForm, RecordPriceForm } from "@/components/subscriptions/price-forms";
import { correctCostRecordAction, recordPriceChangeAction } from "@/app/(app)/subscriptions/actions";
import { convertSeries, monthlySeries, priceChanges, type PriceChange } from "@/domain/cost-history";
import { frequencyLabel } from "@/domain/constants";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { CostHistoryRow, ExchangeRateRow } from "@/lib/supabase/database.types";

const ANNOTATION = {
  increase: { label: "Increase", tone: "danger", glyph: "▲" },
  decrease: { label: "Decrease", tone: "ok", glyph: "▼" },
  discount: { label: "Discount", tone: "ok", glyph: "▼" },
  plan_change: { label: "Plan change", tone: "info", glyph: "◆" },
} as const;

const signed = (n: string) => (n.startsWith("-") ? n : `+${n}`);

export function CostHistorySection({
  subscriptionId,
  history,
  rates,
  today,
  canEdit,
  archived,
  correctId,
}: {
  subscriptionId: string;
  history: CostHistoryRow[]; // newest first
  rates: ExchangeRateRow[];
  today: string;
  canEdit: boolean;
  archived: boolean;
  correctId?: string;
}) {
  const changes = priceChanges(history);
  const latest = history[0]; // newest first, may be future-dated
  const current = history.find((h) => h.effective_from <= today && (h.effective_to == null || h.effective_to >= today));
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
      tone: a.tone,
    });
  }

  const last = history[0];
  const defaults = {
    currency: (current ?? last)?.currency ?? "USD",
    billing_frequency: (current ?? last)?.billing_frequency ?? "monthly",
    cycle_months: String((current ?? last)?.cycle_months ?? ""),
  };
  const correcting = canEdit ? history.find((h) => h.id === correctId) : undefined;

  return (
    <section className="mt-4 rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold">Cost history</h2>

      {hasRecurring && target && (
        <div className="mb-5">
          <p className="mb-1 text-xs text-muted">
            Normalized monthly cost in {target}
            {mixed && " — earlier prices in other currencies are converted at the rate in effect at that date"}
          </p>
          <CostChart points={points} marks={marks} currency={target} />
          {gaps.length > 0 && (
            <p role="note" className="mt-2 rounded-md border border-warn/40 bg-warn/10 p-2 text-xs">
              {gaps.length} month{gaps.length === 1 ? "" : "s"} could not be shown in {target}: {gaps[0].note} Add the missing rate in{" "}
              <Link href="/settings" className="underline">Settings</Link>.
            </p>
          )}
        </div>
      )}

      {history.length === 0 ? (
        <p className="text-sm text-muted">No prices recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Billing amount timeline, newest first</caption>
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">Effective</th>
                <th scope="col" className="py-2 pr-4 font-medium">Billed</th>
                <th scope="col" className="py-2 pr-4 font-medium">Monthly</th>
                <th scope="col" className="py-2 pr-4 font-medium">Change vs previous</th>
                <th scope="col" className="py-2 pr-4 font-medium">Reason</th>
                <th scope="col" className="py-2 font-medium">Recorded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.map((h) => {
                const c = changes.get(h.effective_from);
                return (
                  <tr key={h.id} className="align-top">
                    <td className="py-2 pr-4">
                      {formatDate(h.effective_from)} → {h.effective_to ? formatDate(h.effective_to) : "ongoing"}
                      {h.effective_from > today && <Badge tone="info" glyph="◷" className="ml-2">Scheduled</Badge>}
                    </td>
                    <td className="py-2 pr-4">
                      {formatMoney(h.amount, h.currency)} <span className="text-xs text-muted">{frequencyLabel(h.billing_frequency)}</span>
                    </td>
                    <td className="py-2 pr-4">{h.normalized_monthly ? formatMoney(h.normalized_monthly, h.currency) : "—"}</td>
                    <td className="py-2 pr-4">
                      <ChangeCell change={c} type={h.change_type} />
                    </td>
                    <td className="py-2 pr-4">{h.reason ?? "—"}</td>
                    <td className="py-2 text-muted">
                      <div>{formatDateTime(h.recorded_at)}</div>
                      {canEdit && (
                        <Link href={correctId === h.id ? `/subscriptions/${subscriptionId}` : `/subscriptions/${subscriptionId}?correct=${h.id}`} className="text-xs text-accent underline">
                          {correctId === h.id ? "Cancel correction" : "Correct this record"}
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

      {correcting && (
        <div className="mt-4">
          <h3 className="text-sm font-medium">
            Correct the price effective {formatDate(correcting.effective_from)}
          </h3>
          <p className="text-xs text-muted">
            Use this for mistakes in a recorded price. For a real price change, record a new one instead so the history stays accurate.
          </p>
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
        </div>
      )}

      {canEdit && !archived && (
        <details className="mt-5 rounded-md border border-border" open={history.length === 0}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Record price change</summary>
          <div className="border-t border-border p-3">
            <RecordPriceForm action={recordPriceChangeAction.bind(null, subscriptionId)} defaults={defaults} />
          </div>
        </details>
      )}
    </section>
  );
}

function ChangeCell({ change, type }: { change: PriceChange | { note: string } | undefined; type: string }) {
  if (!change) return <span className="text-muted">{type === "initial" ? "Initial price" : "—"}</span>;
  if ("note" in change) return <span className="text-xs text-muted">{change.note}</span>;
  const a = change.annotation ? ANNOTATION[change.annotation] : null;
  const zero = Number(change.absolute) === 0;
  return (
    <div className="space-y-1">
      <div>
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
