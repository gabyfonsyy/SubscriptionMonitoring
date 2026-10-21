import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, CalendarClock, CalendarRange, CircleDollarSign, Repeat } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, EmptyState } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { LinkButton } from "@/components/ui/button";
import { Kpi } from "@/components/dashboard/kpi";
import { BreakdownView } from "@/components/dashboard/breakdown";
import { AttentionList } from "@/components/subscriptions/attention-list";
import { TrendLine } from "@/components/charts/charts";
import { getCurrentUser } from "@/lib/auth";
import { listAllCostHistory, listAllInventory, groupHistory } from "@/data/portfolio";
import { buildAttentionQueue, upcomingRenewals } from "@/domain/attention";
import { breakdownByCurrency, monthOverMonth, monthlyTrend, recentPriceChanges, summarize } from "@/domain/summary";
import { DIMENSIONS, dimension } from "@/lib/dimensions";
import { daysBetween, todayISO } from "@/lib/date";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };

const PERIODS = [3, 6, 12, 24] as const;
const monthLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

type SP = { period?: string; currency?: string; by?: string };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const months = (PERIODS as readonly number[]).includes(Number(sp.period)) ? Number(sp.period) : 12;
  const today = todayISO();
  const [user, rows, historyRows] = await Promise.all([getCurrentUser(), listAllInventory(), listAllCostHistory()]);

  const summary = summarize(rows, today);
  const attention = buildAttentionQueue(rows, today);
  const urgent = attention.filter((i) => i.severity === "high").length;
  const renewals = upcomingRenewals(rows, today, 30);

  const history = groupHistory(historyRows);
  const trendSubs = rows.map((r) => ({ id: r.id, name: r.name, archived_at: r.archived_at, history: history.get(r.id) ?? [] }));
  const trend = monthlyTrend(trendSubs, today, months);
  const deltas = monthOverMonth(monthlyTrend(trendSubs, today, 2));
  const changes = recentPriceChanges(trendSubs, today, 90);

  // One currency is charted at a time (never summed across currencies); default to the largest.
  const currencies = [...summary.monthly].sort((a, b) => b[1].cmp(a[1])).map(([c]) => c);
  const currency = currencies.includes((sp.currency ?? "").toUpperCase()) ? sp.currency!.toUpperCase() : (currencies[0] ?? "");
  const dim = dimension(sp.by, "product");
  const byCategory = breakdownByCurrency(rows, DIMENSIONS[0].of).get(currency) ?? [];
  const byDim = breakdownByCurrency(rows, dim.of).get(currency) ?? [];

  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { period: String(months), currency: currency || undefined, by: dim.key, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/overview?${p.toString()}`;
  };

  const series = trend.map((p) => ({ label: monthLabel(p.month), value: Number(p.totals.get(currency)?.toFixed() ?? 0) }));
  const hasData = summary.activeCount > 0;

  return (
    <>
      <PageHeader
        title="Subscription Overview"
        description={`What we manage, what it costs, what changed and what needs attention. Trend: last ${months} months.`}
        actions={
          <>
            <Segmented
              label="Reporting period"
              active={String(months)}
              options={PERIODS.map((p) => ({ key: String(p), label: `${p}M`, href: qs({ period: String(p) }) }))}
            />
            {user?.canEdit && <LinkButton href="/subscriptions/new" variant="primary">New subscription</LinkButton>}
          </>
        }
      />

      {!hasData ? (
        <EmptyState
          title="No subscriptions yet"
          action={user?.canEdit ? <LinkButton href="/subscriptions/new" variant="primary">Add the first subscription</LinkButton> : undefined}
        >
          Spend, renewals and attention items appear here once subscriptions are registered.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
            <Kpi icon={Repeat} tint="green" label="Active subscriptions" value={String(summary.activeCount)} sub={`${rows.length - summary.activeCount} archived or expired`} href="/subscriptions" />
            <Kpi icon={CircleDollarSign} tint="blue" label="Monthly recurring cost" totals={summary.monthly} deltas={deltas} sub="Normalized, per currency" />
            <Kpi icon={CalendarRange} tint="violet" label="Annual recurring cost" totals={summary.annual} sub="Monthly × 12" />
            <Kpi icon={CalendarClock} tint="cyan" label="Renewals in 30 days" value={String(summary.renewals30)} sub={renewals[0] ? `Next: ${renewals[0].name}, ${formatDate(renewals[0].renewalDate)}` : "None scheduled"} href="/alerts?tab=renewals" />
            <Kpi
              icon={BellRing}
              tint={urgent ? "red" : "amber"}
              label="Needs attention"
              value={String(attention.length)}
              sub={urgent ? `${urgent} urgent` : "Nothing urgent"}
              tone={urgent ? "danger" : "default"}
              href="/alerts"
            />
          </section>

          <div className="grid gap-5 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title={`Monthly recurring spend${currency ? ` (${currency})` : ""}`}
              description="Normalized monthly cost by effective-dated price. Archived subscriptions count until the month they were archived."
              actions={
                currencies.length > 1 ? (
                  <Segmented label="Currency" active={currency} options={currencies.map((c) => ({ key: c, label: c, href: qs({ currency: c }) }))} />
                ) : undefined
              }
            >
              {currency && series.some((s) => s.value > 0) ? (
                <TrendLine data={series} currency={currency} />
              ) : (
                <p className="py-10 text-center text-sm text-muted">No priced history in this period yet.</p>
              )}
            </Panel>

            <Panel
              title="Needs attention"
              description={attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"}, most urgent first` : undefined}
              actions={attention.length > 5 ? <Link href="/alerts" className="text-xs font-medium text-accent hover:underline">View all</Link> : undefined}
            >
              {attention.length === 0 ? (
                <p className="text-sm text-muted">Nothing needs attention right now.</p>
              ) : (
                <AttentionList items={attention} limit={5} compact />
              )}
            </Panel>
          </div>

          {currency && (
            <div className="grid gap-5 xl:grid-cols-2">
              <Panel title={`Spend by category (${currency})`}>
                <BreakdownView data={byCategory} currency={currency} label="Spend by category" />
              </Panel>
              <Panel
                title={`Spend by ${dim.label.toLowerCase()} (${currency})`}
                actions={
                  <Segmented
                    label="Group by"
                    active={dim.key}
                    options={DIMENSIONS.filter((d) => d.key !== "category" && d.key !== "frequency").map((d) => ({ key: d.key, label: d.label, href: qs({ by: d.key }) }))}
                  />
                }
              >
                <BreakdownView data={byDim} currency={currency} label={`Spend by ${dim.label.toLowerCase()}`} />
              </Panel>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Recent price changes" description="Last 90 days, plus any scheduled." flush>
              {changes.length === 0 ? (
                <p className="p-5 text-sm text-muted">No price changes recorded in this window.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {changes.slice(0, 6).map((c) => {
                    const up = Number(c.absolute) > 0;
                    return (
                      <li key={`${c.subscriptionId}-${c.effectiveFrom}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                        <div className="min-w-0">
                          <Link href={`/subscriptions/${c.subscriptionId}?tab=cost`} className="block truncate font-medium hover:underline">{c.name}</Link>
                          <p className="num text-xs text-muted">
                            {formatDate(c.effectiveFrom)}{c.scheduled ? " · scheduled" : ""} · {formatMoney(c.previous, c.currency)} → {formatMoney(c.current, c.currency)} / mo
                          </p>
                        </div>
                        <span className={`num shrink-0 text-xs font-medium ${up ? "text-warn" : "text-ok"}`}>
                          <span aria-hidden>{up ? "▲" : "▼"}</span> {up ? "+" : "−"}
                          {c.percent != null ? `${c.percent.replace("-", "")}%` : formatMoney(c.absolute.replace("-", ""), c.currency)}
                          <span className="sr-only">{up ? " increase" : " decrease"}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel
              title="Upcoming renewals"
              description="Next 30 days"
              actions={<Link href="/alerts?tab=renewals" className="text-xs font-medium text-accent hover:underline">Next 90 days</Link>}
              flush
            >
              {renewals.length === 0 ? (
                <p className="p-5 text-sm text-muted">No renewals in the next 30 days.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {renewals.slice(0, 6).map((r) => {
                    const left = daysBetween(today, r.renewalDate);
                    return (
                      <li key={r.subscriptionId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                        <Link href={`/subscriptions/${r.subscriptionId}`} className="truncate font-medium hover:underline">{r.name}</Link>
                        <span className="num shrink-0 text-xs text-muted">
                          {formatDate(r.renewalDate)} · {left === 0 ? "today" : `in ${left}d`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
