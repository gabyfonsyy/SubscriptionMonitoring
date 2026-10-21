import { Badge, type Tone } from "@/components/ui/badge";
import { statusLabel, criticalityLabel } from "@/domain/constants";
import type { RenewalRisk } from "@/domain/renewals";
import type { Criticality, SubscriptionStatus } from "@/lib/supabase/database.types";

const STATUS_TONE: Record<SubscriptionStatus, { tone: Tone; glyph: string }> = {
  active: { tone: "ok", glyph: "●" },
  pending: { tone: "info", glyph: "◔" },
  under_review: { tone: "warn", glyph: "▲" },
  cancellation_requested: { tone: "warn", glyph: "✕" },
  expired: { tone: "danger", glyph: "■" },
  archived: { tone: "neutral", glyph: "▭" },
};

/** Operational status: what state the subscription is in. */
export function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const s = STATUS_TONE[status];
  return (
    <Badge tone={s.tone} glyph={s.glyph}>
      {statusLabel(status)}
    </Badge>
  );
}

const RISK: Record<RenewalRisk["level"], { tone: Tone; glyph: string; label: string }> = {
  unknown: { tone: "neutral", glyph: "?", label: "Needs data" },
  overdue: { tone: "danger", glyph: "!", label: "Overdue" },
  notice_passed: { tone: "danger", glyph: "!", label: "Notice window passed" },
  due_soon: { tone: "warn", glyph: "▲", label: "Due soon" },
  upcoming: { tone: "info", glyph: "◷", label: "Upcoming" },
  ok: { tone: "ok", glyph: "✓", label: "No action" },
};

/** Renewal risk: separate from status. "Needs data" when there is no renewal date. */
export function RenewalBadge({ risk }: { risk: RenewalRisk }) {
  const r = RISK[risk.level];
  const detail =
    risk.daysUntilRenewal == null
      ? ""
      : risk.daysUntilRenewal < 0
        ? ` · ${Math.abs(risk.daysUntilRenewal)}d ago`
        : ` · ${risk.daysUntilRenewal}d`;
  return (
    <Badge tone={r.tone} glyph={r.glyph}>
      {r.label}
      {detail}
    </Badge>
  );
}

export function CriticalityBadge({ value }: { value: Criticality | null }) {
  if (!value) return <Badge glyph="?">Needs data</Badge>;
  const tone: Tone = value === "critical" ? "danger" : value === "high" ? "warn" : "neutral";
  return <Badge tone={tone}>{criticalityLabel(value)}</Badge>;
}
