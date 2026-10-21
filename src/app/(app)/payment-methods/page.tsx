import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ConfirmAction } from "@/components/ui/confirm-dialog";
import { CardForm } from "@/components/payment-methods/card-form";
import { createCardAction, setCardRetiredAction, updateCardAction } from "./actions";
import { listCardsWithSubscriptions } from "@/data/cards";
import { listTeams } from "@/data/reference";
import { getCurrentUser } from "@/lib/auth";
import { expiryState, formatExpiry } from "@/domain/cards";
import { todayISO } from "@/lib/date";

export const metadata: Metadata = { title: "Payment Methods" };

export default async function Page({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const [user, { cards, linked }, teams] = await Promise.all([getCurrentUser(), listCardsWithSubscriptions(), listTeams({ includeArchived: true })]);
  const canEdit = !!user?.canEdit;
  const today = todayISO();
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const teamOptions = teams.filter((t) => !t.archived_at).map((t) => ({ value: t.id, label: t.name }));

  const live = (cardId: string) => (linked.get(cardId) ?? []).filter((s) => s.status !== "archived");
  const atRisk = cards.filter((c) => (c.retired_at || expiryState(c.expiry_month, c.expiry_year, today) === "expired") && live(c.id).length > 0);

  return (
    <>
      <PageHeader title="Payment Methods" description="Cards used for subscriptions. Only a nickname, the last four digits and the expiry are stored." />

      {atRisk.length > 0 && (
        <div role="alert" className="mb-4 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
          <span className="font-medium">Needs a new card:</span>{" "}
          {atRisk.map((c, i) => (
            <span key={c.id}>
              {i > 0 && "; "}
              {c.label} •••• {c.last_four} ({c.retired_at ? "retired" : "expired"}) is still linked to {live(c.id).length} active subscription{live(c.id).length === 1 ? "" : "s"}
            </span>
          ))}
          .
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-5">
        {cards.length === 0 ? (
          <p className="text-sm text-muted">No cards yet. Add one below, then choose it on a subscription.</p>
        ) : (
          <ul className="divide-y divide-border">
            {cards.map((c) => {
              const state = expiryState(c.expiry_month, c.expiry_year, today);
              const subs = linked.get(c.id) ?? [];
              const activeCount = live(c.id).length;
              return (
                <li key={c.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className={`font-medium ${c.retired_at ? "text-muted line-through" : ""}`}>
                        {c.label} <span className="font-normal text-muted">•••• {c.last_four}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>Expires {formatExpiry(c.expiry_month, c.expiry_year)}</span>
                        {state === "expired" && <Badge tone="danger" glyph="✕">Expired</Badge>}
                        {state === "expiring_soon" && <Badge tone="warn" glyph="▲">Expiring soon</Badge>}
                        {c.retired_at && <Badge glyph="▭">Retired</Badge>}
                        <span>{c.responsible_team_id ? `Team: ${teamName.get(c.responsible_team_id) ?? "unknown"}` : "No team"}</span>
                        {c.cardholder_note && <span>Holder: {c.cardholder_note}</span>}
                      </div>
                      {c.notes && <div className="text-xs text-muted">{c.notes}</div>}
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-3">
                        {!c.retired_at && (
                          <Link href={edit === c.id ? "/payment-methods" : `/payment-methods?edit=${c.id}`} className="text-xs text-accent underline">
                            {edit === c.id ? "Cancel" : "Edit"}
                          </Link>
                        )}
                        <ConfirmAction
                          action={setCardRetiredAction.bind(null, c.id, !c.retired_at)}
                          trigger={c.retired_at ? "Restore" : "Retire"}
                          title={c.retired_at ? "Restore this card?" : "Retire this card?"}
                          description={
                            c.retired_at
                              ? "It becomes selectable again on subscriptions."
                              : activeCount > 0
                                ? `${activeCount} active subscription${activeCount === 1 ? " is" : "s are"} still linked to it and will show a “Retired card” warning until you move ${activeCount === 1 ? "it" : "them"} to another card. History is kept.`
                                : "It can no longer be chosen for new subscriptions. History is kept."
                          }
                          confirmLabel={c.retired_at ? "Restore" : "Retire"}
                          danger={!c.retired_at}
                        />
                      </div>
                    )}
                  </div>

                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-accent">
                      {subs.length} linked subscription{subs.length === 1 ? "" : "s"}
                    </summary>
                    {subs.length === 0 ? (
                      <p className="mt-1 text-xs text-muted">Nothing is paid with this card.</p>
                    ) : (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                        {subs.map((s) => (
                          <li key={s.id}>
                            <Link href={`/subscriptions/${s.id}`} className="underline">{s.name}</Link>{" "}
                            <span className="text-xs text-muted">· {s.vendor}{s.status === "archived" ? " · archived" : ""}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>

                  {canEdit && edit === c.id && !c.retired_at && (
                    <div className="mt-3 rounded-md border border-border bg-background p-3">
                      <CardForm
                        key={c.id}
                        idp="edit-"
                        submitLabel="Save changes"
                        teams={teamOptions}
                        action={updateCardAction.bind(null, c.id)}
                        initial={{
                          label: c.label,
                          last_four: c.last_four,
                          expiry_month: String(c.expiry_month),
                          expiry_year: String(c.expiry_year),
                          responsible_team_id: c.responsible_team_id ?? "",
                          cardholder_note: c.cardholder_note ?? "",
                          notes: c.notes ?? "",
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canEdit && (
        <section className="mt-4 rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-sm font-semibold">Add a card</h2>
          <p className="mb-3 text-xs text-muted">Never enter the full card number or security code. They are rejected on purpose.</p>
          <CardForm idp="new-" submitLabel="Add card" teams={teamOptions} action={createCardAction} />
        </section>
      )}
    </>
  );
}
