import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { AddRateForm, CorrectRateForm, ImportRatesForm } from "@/components/settings/rate-forms";
import { addRateAction, correctRateAction, importRatesAction } from "./actions";
import { listExchangeRates } from "@/data/exchange-rates";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { getIntegrationStatus } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function Page({ searchParams }: { searchParams: Promise<{ edit?: string; notice?: string; c?: string; s?: string; f?: string; r?: string; chat?: string }> }) {
  const sp = await searchParams;
  const { edit } = sp;
  const supabase = await createClient();
  const { data: alertRules } = await supabase.from("alert_rules").select("*").order("alert_type");
  const [user, rates] = await Promise.all([getCurrentUser(), listExchangeRates()]);
  const canEdit = !!user?.canEdit;
  const editing = user?.isAdmin ? rates.find((r) => r.id === edit) : undefined;

  return (
    <>
      <PageHeader title="Settings" description="Exchange rates now; roles, alert rules and integrations arrive in later phases." />

      <NotificationSettings
        status={getIntegrationStatus()}
        isAdmin={!!user?.isAdmin}
        rules={alertRules ?? []}
        notice={sp}
      />

      <section className="mt-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Exchange rates</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          Reports show each currency separately by default. When you choose to convert, the latest rate dated on or before the
          reporting date is used, never a later one, and it is labelled with its date and source. If no rate exists, the report
          says so instead of guessing.
        </p>

        {canEdit ? (
          <div className="mb-6 space-y-6">
            <AddRateForm action={addRateAction} />
            <div>
              <h3 className="mb-1 text-sm font-medium">Import from CSV</h3>
              <p className="mb-2 text-xs text-muted">
                Header row required: <span className="font-mono">base_currency,quote_currency,rate,effective_date,source</span>{" "}
                (source optional, up to 500 rows). Rates that already exist are skipped, not overwritten.
              </p>
              <ImportRatesForm action={importRatesAction} />
            </div>
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted">You have view-only access. Ask an editor or admin to add rates.</p>
        )}

        {rates.length === 0 ? (
          <p className="text-sm text-muted">No exchange rates yet. Add one above to enable converted totals.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Exchange rates, newest first</caption>
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Effective</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Pair</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Rate</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Source</th>
                  {user?.isAdmin && <th scope="col" className="py-2 font-medium"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rates.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-4">{formatDate(r.effective_date)}</td>
                    <td className="py-2 pr-4">1 {r.base_currency} = {r.quote_currency}</td>
                    <td className="py-2 pr-4 tabular-nums">{Number(r.rate)}</td>
                    <td className="py-2 pr-4">{r.source ?? "—"}</td>
                    {user?.isAdmin && (
                      <td className="py-2 text-right">
                        <Link href={edit === r.id ? "/settings" : `/settings?edit=${r.id}`} className="text-xs text-accent underline">
                          {edit === r.id ? "Cancel" : "Correct"}
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editing && (
          <div className="mt-4">
            <h3 className="mb-1 text-sm font-medium">
              Correct 1 {editing.base_currency} = {editing.quote_currency} on {formatDate(editing.effective_date)}
            </h3>
            <CorrectRateForm key={editing.id} action={correctRateAction.bind(null, editing.id)} rate={String(Number(editing.rate))} source={editing.source ?? ""} />
          </div>
        )}
      </section>
    </>
  );
}
