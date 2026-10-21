"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** One look for every chart: quiet grid, muted axes, tooltip that matches the app's surfaces. */
const tip = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    boxShadow: "var(--shadow-md)",
    padding: "8px 10px",
  },
  labelStyle: { color: "var(--foreground)", fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: "var(--muted)" },
};
const axis = { tick: { fill: "var(--muted)", fontSize: 11 }, stroke: "var(--border)", tickLine: false } as const;

const compact = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n);
const exact = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

export type TrendDatum = { label: string; value: number };

/** Monthly recurring spend over time, in one currency. The same figures are available as a table via the chart's description. */
export function TrendLine({ data, currency, height = 260 }: { data: TrendDatum[]; currency: string; height?: number }) {
  return (
    <div role="img" aria-label={`Monthly recurring spend in ${currency} over ${data.length} months, from ${data[0]?.label ?? "start"} to ${data[data.length - 1]?.label ?? "now"}.`} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis {...axis} axisLine={false} width={64} domain={[0, "auto"]} tickFormatter={(v: number) => compact(v, currency)} />
          <Tooltip {...tip} cursor={{ stroke: "var(--border-strong)" }} formatter={(v) => [typeof v === "number" ? `${exact(v, currency)} / month` : "—", "Monthly spend"]} />
          <Area type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} fill="url(#trend-fill)" dot={false} activeDot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal ranked bars of monthly spend. Labels sit on the axis; exact values are in the table beside it. */
export function SpendBars({ data, currency, label, palette }: { data: { name: string; value: number }[]; currency: string; label: string; palette?: string[] }) {
  return (
    <div role="img" aria-label={`${label} in ${currency}. The same figures are listed beside the chart.`} className="w-full" style={{ height: Math.max(96, data.length * 30 + 24) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barCategoryGap={6}>
          <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
          <XAxis type="number" {...axis} axisLine={false} tickFormatter={(v: number) => compact(v, currency)} />
          <YAxis type="category" dataKey="name" width={104} {...axis} axisLine={false} interval={0} tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
          <Tooltip {...tip} cursor={{ fill: "var(--surface-2)" }} formatter={(v) => [typeof v === "number" ? `${exact(v, currency)} / month` : "—", "Monthly cost"]} />
          <Bar dataKey="value" fill={palette?.[0] ?? "var(--chart-1)"} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {palette && palette.length > 1 && data.map((d, i) => <Cell key={d.name} fill={palette[i % palette.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
