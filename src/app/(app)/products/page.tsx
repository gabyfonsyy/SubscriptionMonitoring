import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ConfirmAction } from "@/components/ui/confirm-dialog";
import { SelectInput, SubmitButton, inputCls } from "@/components/ui/form";
import { getCurrentUser } from "@/lib/auth";
import { listProducts, listTeams } from "@/data/reference";
import {
  createProductAction,
  createTeamAction,
  setArchivedAction,
  updateProductAction,
  updateTeamAction,
} from "./actions";

export const metadata: Metadata = { title: "Products & Services" };

const ERRORS: Record<string, string> = {
  forbidden: "You do not have permission to change this.",
  invalid: "A name is required.",
  duplicate: "That name already exists.",
  failed: "The change could not be saved. Please try again.",
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [user, products, teams] = await Promise.all([
    getCurrentUser(),
    listProducts({ includeArchived: true }),
    listTeams({ includeArchived: true }),
  ]);
  const canEdit = !!user?.canEdit;
  const teamOptions = teams.filter((t) => !t.archived_at).map((t) => ({ value: t.id, label: t.name }));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  return (
    <>
      <PageHeader title="Products & Services" description="What each subscription is used for, and which team owns it." />

      {error && ERRORS[error] && (
        <p role="alert" className="mb-4 rounded-md border border-danger/30 bg-danger-wash p-3 text-sm">{ERRORS[error]}</p>
      )}

      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Products &amp; services</h2>
        {products.length === 0 ? (
          <p className="text-sm text-muted">No products yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {products.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className={`font-medium ${p.archived_at ? "text-muted line-through" : ""}`}>{p.name}</span>{" "}
                    {p.archived_at && <Badge glyph="▭">Archived</Badge>}
                    <div className="text-xs text-muted">
                      {p.owner_team_id ? `Owned by ${teamName.get(p.owner_team_id) ?? "unknown team"}` : "No owner team"}
                      {p.description ? ` · ${p.description}` : ""}
                    </div>
                  </div>
                  {canEdit && (
                    <ConfirmAction
                      action={setArchivedAction.bind(null, "products", p.id, !p.archived_at)}
                      trigger={p.archived_at ? "Restore" : "Archive"}
                      title={p.archived_at ? "Restore this product?" : "Archive this product?"}
                      description={
                        p.archived_at
                          ? "It becomes selectable again."
                          : "It can no longer be chosen for new subscriptions. Existing subscriptions keep their link."
                      }
                      confirmLabel={p.archived_at ? "Restore" : "Archive"}
                      danger={!p.archived_at}
                    />
                  )}
                </div>
                {canEdit && !p.archived_at && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-accent">Edit</summary>
                    <form action={updateProductAction.bind(null, p.id)} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                      <input name="name" defaultValue={p.name} required aria-label="Name" className={inputCls} />
                      <input name="description" defaultValue={p.description ?? ""} placeholder="Description" aria-label="Description" className={inputCls} />
                      <SelectInput name="owner_team_id" options={teamOptions} defaultValue={p.owner_team_id} placeholder="No owner team" />
                      <SubmitButton variant="secondary">Save</SubmitButton>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form action={createProductAction} className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input name="name" required placeholder="New product or service" aria-label="New product name" className={inputCls} />
            <input name="description" placeholder="Description (optional)" aria-label="Description" className={inputCls} />
            <SelectInput name="owner_team_id" options={teamOptions} placeholder="No owner team" />
            <SubmitButton pendingText="Adding…">Add product</SubmitButton>
          </form>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Teams</h2>
        {teams.length === 0 ? (
          <p className="text-sm text-muted">No teams yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {teams.map((t) => (
              <li key={t.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className={`font-medium ${t.archived_at ? "text-muted line-through" : ""}`}>{t.name}</span>{" "}
                    {t.archived_at && <Badge glyph="▭">Archived</Badge>}
                    {t.description && <div className="text-xs text-muted">{t.description}</div>}
                  </div>
                  {canEdit && (
                    <ConfirmAction
                      action={setArchivedAction.bind(null, "teams", t.id, !t.archived_at)}
                      trigger={t.archived_at ? "Restore" : "Archive"}
                      title={t.archived_at ? "Restore this team?" : "Archive this team?"}
                      description={
                        t.archived_at
                          ? "It becomes selectable again."
                          : "It can no longer be chosen for new records. Existing records keep their link."
                      }
                      confirmLabel={t.archived_at ? "Restore" : "Archive"}
                      danger={!t.archived_at}
                    />
                  )}
                </div>
                {canEdit && !t.archived_at && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-accent">Edit</summary>
                    <form action={updateTeamAction.bind(null, t.id)} className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                      <input name="name" defaultValue={t.name} required aria-label="Name" className={inputCls} />
                      <input name="description" defaultValue={t.description ?? ""} placeholder="Description" aria-label="Description" className={inputCls} />
                      <SubmitButton variant="secondary">Save</SubmitButton>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form action={createTeamAction} className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-[1fr_2fr_auto]">
            <input name="name" required placeholder="New team" aria-label="New team name" className={inputCls} />
            <input name="description" placeholder="Description (optional)" aria-label="Description" className={inputCls} />
            <SubmitButton pendingText="Adding…">Add team</SubmitButton>
          </form>
        )}
      </section>
    </>
  );
}
