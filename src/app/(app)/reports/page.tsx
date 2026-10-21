import type { Metadata } from "next";
import { buttonCls } from "@/components/ui/button";
import Link from "next/link";
import Decimal from "decimal.js";
import { PageHeader } from "@/components/ui/page-header";
import { inputCls } from "@/components/ui/form";
import { listExchangeRates } from "@/data/exchange-rates";
import { getCurrentRecurringSpend } from "@/data/spend";
import { convertTotals } from "@/domain/cost-history";
import { todayISO } from "@/lib/date";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Reports" };

const EXPORTS = [
  { kind: "subscriptions", title: "Subscription inventory", hint: "Every subscription, including archived, with today's price." },
  { kind: "cost-history", title: "Cost history", hint: "Every recorded price period, including archived subscriptions." },
  { kind: "renewals", title: "Renewals (next 12 months)", hint: "Renewal and cancel-by dates, soonest first." },
  { kind: "cards", title: "Payment methods", hint: "Cards with expiry status and active subscription counts." },
  { kind: "attention", title: "Attention queue", hint: "Everything that needs action right now." },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ currency?: string }> }) {
  const { currency } = await searchParams;
  const target = /^[A-Za-z]{3}$/.test(currency ?? "") ? currency!.toUpperCase() : "";
  const today = todayISO();
  const [totals, rates] = await Promise.all([getCurrentRecurringSpend(), target ? listExchangeRates() : Promise.resolve([])]);
  const converted = target ? convertTotals(totals, target, today, rates) : null;
  const known = [...new Set([...totals.keys(), ...rates.flatMap((r) => [r.base_currency, r.quote_currency])])].sort();

  return (
    <>
      <PageHeader title="Reports" description="Exportable reports for reviews and reconciliation." />

      <section className="mb-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Monthly recurring spend</h2>
            <p className="text-xs text-muted">Active subscriptions, normalized to a monthly cost, as of {formatDate(today)}. One-time charges are excluded.</p>
          </div>
          <form className="flex items-end gap-2" action="/reports">
            <label className="text-xs text-muted">
              <span className="mb-1 block">Show totals as</span>
              <select name="currency" defaultValue={target} className={`${inputCls} w-auto`}>
                <option value="">Each currency separately</option>
                {known.map((c) => <option key={c} value={c}>Converted to {c}</option>)}
              </select>
            </label>
            <button type="submit" className={buttonCls("secondary")}>Apply</button>
          </form>
        </div>

        {totals.size === 0 ? (
          <p className="text-sm text-muted">No priced active subscriptions yet.</p>
        ) : converted == null ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[...totals].sort(([a], [b]) => a.localeCompare(b)).map(([cur, amt]) => (
              <li key={cur} className="rounded-md border border-border bg-background p-3">
                <div className="text-xs text-muted">{cur}</div>
                <div className="text-lg font-semibold tabular-nums">{formatMoney(amt.toFixed(), cur)}</div>
                <div className="text-xs text-muted">per month</div>
              </li>
            ))}
          </ul>
        ) : converted.ok ? (
          <div>
            <div className="text-2xl font-semibold tabular-nums">{formatMoney(converted.total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(), target)}</div>
            <div className="text-xs text-muted">per month, converted to {target}</div>
            {converted.notes.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                {converted.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            )}
          </div>
        ) : (
          <p role="alert" className="rounded-md border border-warn/30 bg-warn-wash p-3 text-sm">
            {converted.reason} Totals are not converted. Add the rate in <Link href="/settings" className="underline">Settings</Link>, or view each currency separately.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold">CSV exports</h2>
        <p className="mb-3 mt-1 text-xs text-muted">Opens in Excel or Sheets. Amounts are per currency and never converted. Cells that look like formulas are neutralised.</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {EXPORTS.map((e) => (
            <li key={e.kind} className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3">
              <div>
                <div className="text-sm font-medium">{e.title}</div>
                <div className="text-xs text-muted">{e.hint}</div>
              </div>
              <a href={`/reports/export/${e.kind}`} download className={`shrink-0 ${buttonCls("secondary", "sm")}`}>Download</a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
