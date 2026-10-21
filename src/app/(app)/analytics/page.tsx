import type { Metadata } from "next";
import Link from "next/link";
import Decimal from "decimal.js";
import { CalendarRange, CircleDollarSign, Percent, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, EmptyState } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kpi } from "@/components/dashboard/kpi";
import { BreakdownView } from "@/components/dashboard/breakdown";
import { TrendLine, SpendBars } from "@/components/charts/charts";
import { listAllCostHistory, listAllInventory, groupHistory } from "@/data/portfolio";
import { breakdownByCurrency, isLive, monthlyTrend, recentPriceChanges, summarize } from "@/domain/summary";
import { DIMENSIONS, dimension } from "@/lib/dimensions";
import { todayISO } from "@/lib/date";
import { formatDate, formatMoney } from "@/lib/format";
import { table, tableWrap, tbody, td, tdRight, th, thRight, thead, tr } from "@/components/ui/table";

export const metadata: Metadata = { title: "Cost Analytics" };

const PERIODS = [3, 6, 12, 24] as const;
const monthLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

type SP = { period?: string; currency?: string; by?: string };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const months = (PERIODS as readonly number[]).includes(Number(sp.period)) ? Number(sp.period) : 12;
  const today = todayISO();
  const [rows, historyRows] = await Promise.all([listAllInventory(), listAllCostHistory()]);

  const summary = summarize(rows, today);
  const history = groupHistory(historyRows);
  const subs = rows.map((r) => ({ id: r.id, name: r.name, archived_at: r.archived_at, history: history.get(r.id) ?? [] }));
  const trend = monthlyTrend(subs, today, months);
  const changes = recentPriceChanges(subs, today, months * 30);

  const currencies = [...summary.monthly].sort((a, b) => b[1].cmp(a[1])).map(([c]) => c);
  const currency = currencies.includes((sp.currency ?? "").toUpperCase()) ? sp.currency!.toUpperCase() : (currencies[0] ?? "");
  const dim = dimension(sp.by, "category");

  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { period: String(months), currency: currency || undefined, by: dim.key, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/analytics?${p.toString()}`;
  };

  const series = trend.map((p) => ({ label: monthLabel(p.month), value: Number(p.totals.get(currency)?.toFixed() ?? 0) }));
  const first = trend[0]?.totals.get(currency) ?? new Decimal(0);
  const last = trend[trend.length - 1]?.totals.get(currency) ?? new Decimal(0);
  const periodChange = first.isZero() ? null : last.minus(first).div(first).mul(100);

  const largest = rows
    .filter((r) => isLive(r) && r.current_currency === currency && r.current_normalized_monthly != null)
    .sort((a, b) => Number(b.current_normalized_monthly) - Number(a.current_normalized_monthly))
    .slice(0, 10);
  const byDim = breakdownByCurrency(rows, dim.of).get(currency) ?? [];

  const inCurrency = changes.filter((c) => c.currency === currency);
  const increases = inCurrency.filter((c) => Number(c.absolute) > 0).length;
  const decreases = inCurrency.filter((c) => Number(c.absolute) < 0).length;

  return (
    <>
      <PageHeader
        title="Cost Analytics"
        description="How spend is trending, where it goes, and what changed. Each currency is shown on its own and never added to another."
        actions={
          <>
            <Segmented label="Reporting period" active={String(months)} options={PERIODS.map((p) => ({ key: String(p), label: `${p}M`, href: qs({ period: String(p) }) }))} />
            {currencies.length > 1 && (
              <Segmented label="Currency" active={currency} options={currencies.map((c) => ({ key: c, label: c, href: qs({ currency: c }) }))} />
            )}
            <LinkButton href="/reports/export/cost-history">Export cost history</LinkButton>
          </>
        }
      />

      {!currency ? (
        <EmptyState title="No priced subscriptions yet">Cost analytics appear once subscriptions have a recorded price.</EmptyState>
      ) : (
        <div className="space-y-5">
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={CircleDollarSign} tint="blue" label={`Monthly recurring (${currency})`} totals={new Map([[currency, summary.monthly.get(currency)!]])} sub="Today, normalized" />
            <Kpi icon={CalendarRange} tint="violet" label={`Annual recurring (${currency})`} totals={new Map([[currency, summary.annual.get(currency)!]])} sub="Monthly × 12" />
            <Kpi
              icon={TrendingUp}
              tint="green"
              label={`Change over ${months} months`}
              value={periodChange ? `${periodChange.gt(0) ? "+" : periodChange.lt(0) ? "−" : ""}${periodChange.abs().toDecimalPlaces(1).toFixed()}%` : "—"}
              sub={`${formatMoney(first.toFixed(2), currency)} → ${formatMoney(last.toFixed(2), currency)} / month`}
            />
            <Kpi icon={Percent} tint="amber" label="Price changes in period" value={String(inCurrency.length)} sub={`${increases} increase${increases === 1 ? "" : "s"}, ${decreases} decrease${decreases === 1 ? "" : "s"}`} />
          </section>

          <Panel title={`Monthly recurring spend (${currency})`} description={`Last ${months} months, by effective-dated price.`}>
            {series.some((s) => s.value > 0) ? <TrendLine data={series} currency={currency} height={300} /> : <p className="py-10 text-center text-sm text-muted">No priced history in this period.</p>}
          </Panel>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title={`Largest subscriptions (${currency})`} description="By normalized monthly cost, top 10.">
              {largest.length === 0 ? (
                <p className="text-sm text-muted">Nothing priced in {currency}.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] md:items-start">
                  <SpendBars data={largest.map((r) => ({ name: r.name, value: Number(r.current_normalized_monthly) }))} currency={currency} label="Largest subscriptions" />
                  <table className="w-full text-xs">
                    <caption className="sr-only">Largest subscriptions ({currency} per month)</caption>
                    <tbody className="divide-y divide-border">
                      {largest.map((r) => (
                        <tr key={r.id}>
                          <th scope="row" className="max-w-[8rem] truncate py-1.5 pr-2 text-left font-normal">
                            <Link href={`/subscriptions/${r.id}`} className="hover:underline">{r.name}</Link>
                          </th>
                          <td className="num py-1.5 text-right">{formatMoney(r.current_normalized_monthly, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel
              title={`Spend by ${dim.label.toLowerCase()} (${currency})`}
              actions={<Segmented label="Group by" active={dim.key} options={DIMENSIONS.map((d) => ({ key: d.key, label: d.label, href: qs({ by: d.key }) }))} />}
            >
              <BreakdownView data={byDim} currency={currency} label={`Spend by ${dim.label.toLowerCase()}`} />
            </Panel>
          </div>

          <Panel title="Price changes" description={`Everything that changed in the last ${months} months, plus scheduled changes. Compared like for like on monthly cost.`} flush>
            {changes.length === 0 ? (
              <p className="p-5 text-sm text-muted">No price changes in this period.</p>
            ) : (
              <div className={tableWrap}>
                <table className={`${table} min-w-[640px]`}>
                  <caption className="sr-only">Price changes in the selected period, newest first</caption>
                  <thead className={thead}>
                    <tr>
                      <th scope="col" className={th}>Effective</th>
                      <th scope="col" className={th}>Subscription</th>
                      <th scope="col" className={thRight}>Previous / mo</th>
                      <th scope="col" className={thRight}>New / mo</th>
                      <th scope="col" className={thRight}>Change</th>
                    </tr>
                  </thead>
                  <tbody className={tbody}>
                    {changes.map((c) => {
                      const up = Number(c.absolute) > 0;
                      return (
                        <tr key={`${c.subscriptionId}-${c.effectiveFrom}`} className={tr}>
                          <td className={`${td} num`}>
                            {formatDate(c.effectiveFrom)} {c.scheduled && <Badge tone="info" glyph="◷" className="ml-1">Scheduled</Badge>}
                          </td>
                          <td className={td}><Link href={`/subscriptions/${c.subscriptionId}?tab=cost`} className="font-medium hover:underline">{c.name}</Link></td>
                          <td className={tdRight}>{formatMoney(c.previous, c.currency)}</td>
                          <td className={tdRight}>{formatMoney(c.current, c.currency)}</td>
                          <td className={`${tdRight} font-medium ${up ? "text-warn" : "text-ok"}`}>
                            <span aria-hidden>{up ? "▲" : "▼"}</span> {up ? "+" : "−"}
                            {c.percent != null ? `${c.percent.replace("-", "")}%` : formatMoney(c.absolute.replace("-", ""), c.currency)}
                            <span className="sr-only">{up ? " increase" : " decrease"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
