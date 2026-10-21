"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tip = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "var(--foreground)" },
};
const axis = { tick: { fill: "var(--muted)", fontSize: 11 }, stroke: "var(--border)" };

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
const money2 = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

/** Horizontal bars of monthly spend by a dimension. Values are display-only; the same figures are in the table beside it. */
export function SpendBars({ data, currency, label }: { data: { name: string; value: number }[]; currency: string; label: string }) {
  return (
    <div role="img" aria-label={`${label} in ${currency}. The same figures are listed beside the chart.`} className="w-full" style={{ height: Math.max(120, data.length * 34 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" {...axis} tickFormatter={(v: number) => money(v, currency)} />
          <YAxis type="category" dataKey="name" width={110} {...axis} />
          <Tooltip {...tip} cursor={{ fill: "var(--border)", opacity: 0.4 }} formatter={(v) => [typeof v === "number" ? `${money2(v, currency)} / month` : "—", "Monthly cost"]} />
          <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Monthly recurring spend over time, in one currency. */
export function TrendLine({ data, currency }: { data: { month: string; value: number }[]; currency: string }) {
  return (
    <div role="img" aria-label={`Monthly recurring spend over the last 12 months in ${currency}.`} className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="month" {...axis} />
          <YAxis {...axis} width={72} domain={[0, "auto"]} tickFormatter={(v: number) => money(v, currency)} />
          <Tooltip {...tip} formatter={(v) => [typeof v === "number" ? `${money2(v, currency)} / month` : "—", "Monthly spend"]} />
          <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--accent)" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
