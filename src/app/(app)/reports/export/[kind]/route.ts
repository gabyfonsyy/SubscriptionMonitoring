import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { groupHistory, listAllCostHistory, listAllInventory } from "@/data/portfolio";
import { listCardsWithSubscriptions } from "@/data/cards";
import { buildAttentionQueue, upcomingRenewals } from "@/domain/attention";
import { expiryState, formatExpiry } from "@/domain/cards";
import { toCsv } from "@/domain/csv";
import { categoryLabel, frequencyLabel, statusLabel } from "@/domain/constants";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

const KINDS = ["subscriptions", "cost-history", "renewals", "cards", "attention"] as const;
type Kind = (typeof KINDS)[number];

const yesNo = (v: boolean | null) => (v == null ? "unknown" : v ? "yes" : "no");

async function build(kind: Kind, today: string): Promise<string> {
  if (kind === "cards") {
    const { cards, linked } = await listCardsWithSubscriptions();
    return toCsv(
      ["Nickname", "Last four", "Expiry (MM/YY)", "Expiry status", "Retired", "Active subscriptions", "Cardholder"],
      cards.map((c) => [
        c.label,
        c.last_four,
        formatExpiry(c.expiry_month, c.expiry_year),
        expiryState(c.expiry_month, c.expiry_year, today),
        c.retired_at ? "yes" : "no",
        (linked.get(c.id) ?? []).filter((s) => s.status !== "archived").length,
        c.cardholder_note,
      ]),
    );
  }

  const rows = await listAllInventory();

  if (kind === "subscriptions") {
    return toCsv(
      ["Name", "Vendor", "Status", "Category", "Product", "Team", "Owner", "Criticality", "Billing frequency", "Current amount", "Currency", "Monthly equivalent", "Next billing", "Next renewal", "Notice days", "Auto-renew", "Card", "Cost center", "Start", "Expiration"],
      rows.map((r) => [
        r.name, r.vendor, statusLabel(r.status), categoryLabel(r.category), r.product_name, r.team_name, r.owner_name, r.criticality,
        frequencyLabel(r.billing_frequency), r.current_amount, r.current_currency, r.current_normalized_monthly,
        r.next_billing_date, r.next_renewal_date, r.cancellation_notice_days, yesNo(r.auto_renew),
        r.card_label ? `${r.card_label} ${r.card_last_four}` : null, r.cost_center, r.start_date, r.expiration_date,
      ]),
    );
  }

  if (kind === "cost-history") {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const history = groupHistory(await listAllCostHistory());
    const out: (string | number | null)[][] = [];
    for (const [id, periods] of history) {
      const s = byId.get(id);
      for (const h of periods) {
        out.push([s?.name ?? id, s?.vendor ?? null, s ? statusLabel(s.status) : null, h.effective_from, h.effective_to, h.amount, h.currency, frequencyLabel(h.billing_frequency), h.normalized_monthly, h.change_type, h.reason, h.recorded_at]);
      }
    }
    out.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[3]).localeCompare(String(b[3])));
    return toCsv(["Subscription", "Vendor", "Status", "Effective from", "Effective to", "Amount", "Currency", "Billing frequency", "Monthly equivalent", "Change type", "Reason", "Recorded at"], out);
  }

  if (kind === "renewals") {
    const byId = new Map(rows.map((r) => [r.id, r]));
    return toCsv(
      ["Subscription", "Vendor", "Renewal date", "Cancel by", "Auto-renew", "Amount", "Currency"],
      upcomingRenewals(rows, today, 365).map((r) => {
        const s = byId.get(r.subscriptionId);
        return [r.name, s?.vendor, r.renewalDate, r.noticeDeadline, yesNo(r.autoRenew), s?.current_amount, s?.current_currency];
      }),
    );
  }

  return toCsv(
    ["Severity", "Subscription", "Issue", "Date"],
    buildAttentionQueue(rows, today).map((i) => [i.severity, i.name, i.message, i.date]),
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  await requireUser();
  const { kind } = await params;
  if (!(KINDS as readonly string[]).includes(kind)) return new NextResponse("Unknown report", { status: 404 });

  const today = todayISO();
  const csv = await build(kind as Kind, today);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
