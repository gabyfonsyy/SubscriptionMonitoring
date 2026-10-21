import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { AttentionItem, AttentionKind, Severity } from "@/domain/attention";

const SEVERITY: Record<Severity, { label: string; tone: Tone; glyph: string; bar: string }> = {
  high: { label: "Urgent", tone: "danger", glyph: "▲", bar: "bg-danger" },
  medium: { label: "Soon", tone: "warn", glyph: "●", bar: "bg-warn" },
  low: { label: "Housekeeping", tone: "neutral", glyph: "○", bar: "bg-border-strong" },
};

const KIND_LABEL: Record<AttentionKind, string> = {
  renewal_overdue: "Renewal overdue",
  notice_passed: "Cancellation window closed",
  notice_deadline_soon: "Cancel-by deadline",
  renewal_due_soon: "Renewal due soon",
  card_expired: "Card expired",
  card_retired: "Retired card",
  card_expiring_soon: "Card expiring",
  expiration_passed: "Past expiration date",
  no_price: "Missing price",
  no_owner: "No owner",
  no_renewal_date: "No renewal date",
};

/** The next step for each kind of item: where to go to fix it. */
export function nextAction(kind: AttentionKind, subscriptionId: string): { label: string; href: string } {
  const base = `/subscriptions/${subscriptionId}`;
  switch (kind) {
    case "no_price":
      return { label: "Record price", href: `${base}?tab=cost` };
    case "renewal_overdue":
    case "no_renewal_date":
    case "expiration_passed":
      return { label: "Update dates", href: `${base}/edit` };
    case "no_owner":
      return { label: "Assign owner", href: `${base}/edit` };
    case "card_expired":
    case "card_retired":
    case "card_expiring_soon":
      return { label: "Change card", href: `${base}/edit` };
    default:
      return { label: "Review", href: base };
  }
}

export function AttentionList({ items, limit, compact = false }: { items: AttentionItem[]; limit?: number; compact?: boolean }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="divide-y divide-border">
      {shown.map((i) => {
        const sev = SEVERITY[i.severity];
        const action = nextAction(i.kind, i.subscriptionId);
        return (
          <li key={`${i.subscriptionId}-${i.kind}`} className="relative flex flex-wrap items-center gap-x-4 gap-y-1 py-3 pl-4 pr-1">
            <span aria-hidden className={cn("absolute inset-y-3 left-0 w-0.5 rounded-full", sev.bar)} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-sm">
                <Link href={`/subscriptions/${i.subscriptionId}`} className="font-medium hover:underline">{i.name}</Link>
                <span className="text-xs text-muted">{KIND_LABEL[i.kind]}</span>
                {i.severity === "high" && !compact && <Badge tone={sev.tone} glyph={sev.glyph}>{sev.label}</Badge>}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {i.message}
                {i.date && <span className="num"> · {formatDate(i.date)}</span>}
              </p>
            </div>
            <Link href={action.href} className="shrink-0 text-xs font-medium text-accent hover:underline">
              {action.label} →
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
