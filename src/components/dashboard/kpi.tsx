import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import Decimal from "decimal.js";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { CurrencyTotals, MonthDelta } from "@/domain/summary";

type Tone = "default" | "danger" | "warn";
export type Tint = "green" | "blue" | "violet" | "cyan" | "amber" | "red";

/** Each metric gets its own hue: a small pop of colour that also helps people find a card at a glance. */
const TINT: Record<Tint, string> = {
  green: "bg-ok-wash text-ok",
  blue: "bg-blue-wash text-blue",
  violet: "bg-violet-wash text-violet",
  cyan: "bg-info-wash text-info",
  amber: "bg-warn-wash text-warn",
  red: "bg-danger-wash text-danger",
};

/** Compact metric card: label, one primary figure (or one line per currency), one supporting line. */
export function Kpi({
  label,
  value,
  totals,
  deltas,
  sub,
  tone = "default",
  href,
  icon: Icon,
  tint = "green",
}: {
  icon?: LucideIcon;
  tint?: Tint;
  label: string;
  value?: string;
  totals?: CurrencyTotals;
  /** Month-over-month change per currency, shown beside each total. */
  deltas?: MonthDelta[];
  sub?: string;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {Icon && (
          <span aria-hidden className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", TINT[tint])}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      {totals ? (
        totals.size === 0 ? (
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-faint">—</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {[...totals].sort(([a], [b]) => a.localeCompare(b)).map(([cur, amt]) => {
              const d = deltas?.find((x) => x.currency === cur);
              return (
                <li key={cur} className="flex items-baseline gap-2">
                  <span className={cn("num font-semibold tracking-tight", totals.size > 1 ? "text-lg" : "text-2xl")}>
                    {formatMoney(amt.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(), cur)}
                  </span>
                  {d?.percent && !d.percent.isZero() && <Delta percent={d.percent} />}
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <p className={cn("num mt-1.5 text-2xl font-semibold tracking-tight", tone === "danger" && "text-danger", tone === "warn" && "text-warn")}>{value}</p>
      )}
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </>
  );
  const cls = "block rounded-lg border border-border bg-surface p-4 shadow-sm";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-border-strong")}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Direction is shown with an arrow and a sign, not colour alone. Rising spend is neutral-to-warning, not "bad red". */
function Delta({ percent }: { percent: Decimal }) {
  const up = percent.gt(0);
  return (
    <span className={cn("num text-xs font-medium", up ? "text-warn" : "text-ok")} title="Change vs last month">
      <span aria-hidden>{up ? "▲" : "▼"}</span> {up ? "+" : "−"}
      {percent.abs().toDecimalPlaces(1).toFixed()}%
      <span className="sr-only"> vs last month</span>
    </span>
  );
}
