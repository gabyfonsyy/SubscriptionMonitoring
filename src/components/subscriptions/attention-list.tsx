import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/badge";
import type { AttentionItem, Severity } from "@/domain/attention";

const SEVERITY: Record<Severity, { label: string; tone: Tone; glyph: string }> = {
  high: { label: "Urgent", tone: "danger", glyph: "▲" },
  medium: { label: "Soon", tone: "warn", glyph: "●" },
  low: { label: "Housekeeping", tone: "neutral", glyph: "○" },
};

export function AttentionList({ items, limit }: { items: AttentionItem[]; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="divide-y divide-border">
      {shown.map((i) => (
        <li key={`${i.subscriptionId}-${i.kind}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 text-sm">
          <Badge tone={SEVERITY[i.severity].tone} glyph={SEVERITY[i.severity].glyph}>{SEVERITY[i.severity].label}</Badge>
          <Link href={`/subscriptions/${i.subscriptionId}`} className="font-medium underline">{i.name}</Link>
          <span className="text-muted">{i.message}</span>
        </li>
      ))}
    </ul>
  );
}
