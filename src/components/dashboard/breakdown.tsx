import Link from "next/link";
import Decimal from "decimal.js";
import { SpendBars } from "@/components/charts/charts";
import { CHART_PALETTE } from "@/lib/palette";
import { formatMoney } from "@/lib/format";
import type { Breakdown } from "@/domain/summary";

/** Ranked spend breakdown: bars for the shape, a linked table for the exact figures. */
export function BreakdownView({ data, currency, label, limit = 8 }: { data: Breakdown; currency: string; label: string; limit?: number }) {
  if (data.length === 0) return <p className="text-sm text-muted">No priced subscriptions in {currency}.</p>;
  const top = data.slice(0, limit);
  const total = data.reduce((s, d) => s.plus(d.amount), new Decimal(0));
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] md:items-start">
      <SpendBars data={top.map((d) => ({ name: d.label, value: Number(d.amount.toFixed()) }))} currency={currency} label={label} palette={CHART_PALETTE} />
      <table className="w-full text-xs">
        <caption className="sr-only">{label} ({currency} per month)</caption>
        <tbody className="divide-y divide-border">
          {top.map((d, i) => (
            <tr key={d.label}>
              <th scope="row" className="max-w-[8rem] truncate py-1.5 pr-2 text-left font-normal">
                <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                {d.href ? <Link href={d.href} className="hover:underline">{d.label}</Link> : d.label}
              </th>
              <td className="num py-1.5 text-right">{formatMoney(d.amount.toDecimalPlaces(2).toFixed(), currency)}</td>
              <td className="num w-10 py-1.5 text-right text-faint">{total.isZero() ? "" : `${d.amount.div(total).mul(100).toDecimalPlaces(0).toFixed()}%`}</td>
            </tr>
          ))}
          {data.length > top.length && (
            <tr>
              <td colSpan={3} className="pt-2 text-faint">+{data.length - top.length} more</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
