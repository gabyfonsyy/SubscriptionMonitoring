"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartPoint = {
  month: string; // YYYY-MM-01
  value: number | null; // plotted only; exact figures come from the table
  scheduled: boolean;
  note: string | null;
};

export type ChartMark = { month: string; label: string; tone: "danger" | "ok" | "info" };

const TONE_VAR = { danger: "var(--danger)", ok: "var(--ok)", info: "var(--accent)" } as const;
const GLYPH = { danger: "▲", ok: "▼", info: "◆" } as const;

const monthLabel = (m: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${m}T00:00:00Z`));

/**
 * Normalized monthly cost as a step line (a price holds until it changes). Colour is never the only
 * cue: marks carry a glyph and a text label, and the full data is also in the timeline table.
 */
export function CostChart({ points, marks, currency }: { points: ChartPoint[]; marks: ChartMark[]; currency: string }) {
  const data = points.map((p) => ({ ...p, label: monthLabel(p.month) }));
  const valueAt = (m: string) => data.find((d) => d.month === m)?.value ?? null;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

  return (
    <div role="img" aria-label={`Line chart of normalized monthly cost in ${currency} by month. The same figures are in the table below.`} className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 24, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--border)" minTickGap={24} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--border)" tickFormatter={(v: number) => fmt(v)} width={72} domain={[0, "auto"]} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--foreground)" }}
            formatter={(v) => [typeof v === "number" ? `${fmt(v)} / month` : "—", "Monthly cost"]}
            labelFormatter={(l, payload) => {
              const p = payload?.[0]?.payload as (ChartPoint & { label: string }) | undefined;
              return `${l}${p?.scheduled ? " (scheduled)" : ""}${p?.note ? ` · ${p.note}` : ""}`;
            }}
          />
          <Line type="stepAfter" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--accent)" }} connectNulls={false} isAnimationActive={false} />
          {marks.map((m) => {
            const y = valueAt(m.month);
            if (y == null) return null;
            return (
              <ReferenceDot
                key={`${m.month}-${m.label}`}
                x={monthLabel(m.month)}
                y={y}
                r={5}
                fill={TONE_VAR[m.tone]}
                stroke="var(--surface)"
                label={{ value: `${GLYPH[m.tone]} ${m.label}`, position: "top", fill: "var(--foreground)", fontSize: 11 }}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
