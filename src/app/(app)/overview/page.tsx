import type { Metadata } from "next";
import Link from "next/link";
import Decimal from "decimal.js";
import { PageHeader } from "@/components/ui/page-header";
import { AttentionList } from "@/components/subscriptions/attention-list";
import { SpendBars, TrendLine } from "@/components/charts/charts";
import { getIntegrationStatus } from "@/lib/env.server";
import { listAllCostHistory, listAllInventory, groupHistory } from "@/data/portfolio";
import { buildAttentionQueue } from "@/domain/attention";
import { expiryState } from "@/domain/cards";
import { breakdownByCurrency, isLive, monthlyTrend, summarize, type CurrencyTotals } from "@/domain/summary";
import { categoryLabel } from "@/domain/constants";
import { todayISO } from "@/lib/date";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };

const MAX_CURRENCIES_CHARTED = 3;

export default async function OverviewPage() {
  const status = getIntegrationStatus();
  const today = todayISO();
  const [rows, historyRows] = await Promise.all([listAllInventory(), listAllCostHistory()]);

  const summary = summarize(rows, today);
  const attention = buildAttentionQueue(rows, today);
  const urgent = attention.filter((i) => i.severity === "high").length;

  // Distinct cards used by live subscriptions that are expired or about to expire.
  const cardsAtRisk = new Set(
    rows
      .filter((r) => isLive(r) && r.payment_method_id && !r.card_retired_at && r.card_expiry_month && r.card_expiry_year)
      .filter((r) => expiryState(r.card_expiry_month!, r.card_expiry_year!, today) !== "ok")
      .map((r) => r.payment_method_id),
  ).size;

  const history = groupHistory(historyRows);
  const trend = monthlyTrend(
    rows.map((r) => ({ archived_at: r.archived_at, history: history.get(r.id) ?? [] })),
    today,
  );
  const byCategory = breakdownByCurrency(rows, (r) => categoryLabel(r.category));
  const byTeam = breakdownByCurrency(rows, (r) => r.team_name ?? "No team");
  const currencies = [...summary.monthly].sort((a, b) => b[1].cmp(a[1])).map(([c]) => c);
  const charted = currencies.slice(0, MAX_CURRENCIES_CHARTED);

  return (
    <>
      <PageHeader title="Overview" description="Recurring spend, upcoming renewals and items that need attention." />

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Active subscriptions" value={String(summary.activeCount)} href="/subscriptions" />
        <Stat label="Monthly recurring cost" totals={summary.monthly} />
        <Stat label="Annual recurring cost" totals={summary.annual} />
        <Stat label="Renewals in 30 days" value={String(summary.renewals30)} href="/alerts" />
        <Stat label="Needs attention" value={String(attention.length)} sub={urgent ? `${urgent} urgent` : "nothing urgent"} tone={urgent ? "danger" : undefined} href="/alerts" />
        <Stat label="Cards expiring soon" value={String(cardsAtRisk)} sub="expired or within 60 days, still in use" tone={cardsAtRisk ? "warn" : undefined} href="/payment-methods" />
      </section>
      <p className="mt-2 text-xs text-muted">Totals are shown per currency and are never added across currencies. Use Reports to convert with a dated rate.</p>

      <section aria-label="Attention queue" className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Needs attention</h2>
          {attention.length > 6 && <Link href="/alerts" className="text-xs text-accent underline">See all {attention.length}</Link>}
        </div>
        {attention.length === 0 ? <p className="text-sm text-muted">Nothing needs attention right now.</p> : <AttentionList items={attention} limit={6} />}
      </section>

      {charted.map((cur) => {
        const series = trend.map((p) => ({ month: p.month.slice(0, 7), value: Number(p.totals.get(cur)?.toFixed() ?? 0) }));
        const cat = byCategory.get(cur) ?? [];
        const team = byTeam.get(cur) ?? [];
        return (
          <section key={cur} aria-label={`Spend in ${cur}`} className="mt-6 rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold">Spend in {cur}</h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Last 12 months</h3>
                <TrendLine data={series} currency={cur} />
              </div>
              <div className="space-y-6">
                <Breakdown title="By category" data={cat} currency={cur} />
                <Breakdown title="By team" data={team} currency={cur} />
              </div>
            </div>
          </section>
        );
      })}
      {currencies.length > MAX_CURRENCIES_CHARTED && (
        <p className="mt-2 text-xs text-muted">Charts show the {MAX_CURRENCIES_CHARTED} largest currencies; the rest appear in the totals above.</p>
      )}

      <section aria-label="Integration health" className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Integration status</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <StatusRow label="Google Chat notifications" ok={status.googleChatConfigured} />
          <StatusRow label="Scheduled alerts (cron secret)" ok={status.cronSecretConfigured} />
          <StatusRow label="Server database access" ok={status.serviceRoleConfigured} />
        </ul>
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  totals,
  sub,
  tone,
  href,
}: {
  label: string;
  value?: string;
  totals?: CurrencyTotals;
  sub?: string;
  tone?: "danger" | "warn";
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      {totals ? (
        totals.size === 0 ? (
          <p className="mt-2 text-2xl font-semibold text-muted">—</p>
        ) : (
          <ul className="mt-2 space-y-0.5">
            {[...totals].sort(([a], [b]) => a.localeCompare(b)).map(([cur, amt]) => (
              <li key={cur} className="text-xl font-semibold tabular-nums">{formatMoney(amt.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(), cur)}</li>
            ))}
          </ul>
        )
      ) : (
        <p className={`mt-2 text-2xl font-semibold ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : ""}`}>{value}</p>
      )}
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </>
  );
  const cls = "block rounded-xl border border-border bg-surface p-5";
  return href ? <Link href={href} className={`${cls} hover:border-accent/50`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Breakdown({ title, data, currency }: { title: string; data: { label: string; amount: Decimal }[]; currency: string }) {
  if (data.length === 0) return null;
  const top = data.slice(0, 8);
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
        <SpendBars data={top.map((d) => ({ name: d.label, value: Number(d.amount.toFixed()) }))} currency={currency} label={title} />
        <table className="text-xs">
          <caption className="sr-only">{title} ({currency} per month)</caption>
          <tbody>
            {top.map((d) => (
              <tr key={d.label}>
                <th scope="row" className="pr-3 text-left font-normal text-muted">{d.label}</th>
                <td className="text-right tabular-nums">{formatMoney(d.amount.toDecimalPlaces(2).toFixed(), currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > top.length && <p className="text-xs text-muted">Top {top.length} of {data.length}.</p>}
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span>{label}</span>
      <span className={ok ? "text-ok" : "text-warn"}>{ok ? "● Configured" : "▲ Not configured"}</span>
    </li>
  );
}
