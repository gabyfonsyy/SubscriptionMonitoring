import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge, RenewalBadge } from "@/components/subscriptions/badges";
import { Badge } from "@/components/ui/badge";
import { inputCls } from "@/components/ui/form";
import { getCurrentUser } from "@/lib/auth";
import { hasAnySubscription, listInventory, PAGE_SIZE, type InventoryFilters } from "@/data/subscriptions";
import { loadFormOptions } from "@/data/reference";
import { CATEGORIES, FREQUENCIES, STATUSES, categoryLabel, frequencyLabel } from "@/domain/constants";
import { renewalRisk } from "@/domain/renewals";
import { todayISO } from "@/lib/date";
import { formatDate, formatMoney } from "@/lib/format";
import type { InventoryRow } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Subscriptions" };

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = {
    q: first(sp.q),
    status: first(sp.status),
    category: first(sp.category),
    productId: first(sp.product),
    teamId: first(sp.team),
    ownerId: first(sp.owner),
    frequency: first(sp.frequency),
    currency: first(sp.currency),
    autoRenew: first(sp.autoRenew),
    cardId: first(sp.card),
    sort: first(sp.sort),
    dir: first(sp.dir),
  };
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const filters: InventoryFilters = { ...params, page };

  const [user, result, options, anyExist] = await Promise.all([
    getCurrentUser(),
    listInventory(filters),
    loadFormOptions(),
    hasAnySubscription(),
  ]);
  const today = todayISO();
  const filtersActive = Object.values(params).some((v) => v && v !== params.sort && v !== params.dir);

  // Query-string for links that keep current filters (used by sort headers and pagination).
  const urlParams: Record<string, string | undefined> = {
    q: params.q, status: params.status, category: params.category, product: params.productId,
    team: params.teamId, owner: params.ownerId, frequency: params.frequency, currency: params.currency,
    autoRenew: params.autoRenew, card: params.cardId, sort: params.sort, dir: params.dir,
  };
  const sortHref = (col: string) => {
    const next = new URLSearchParams();
    for (const [k, val] of Object.entries(urlParams)) if (val && k !== "sort" && k !== "dir") next.set(k, val);
    next.set("sort", col);
    next.set("dir", params.sort === col && params.dir !== "desc" ? "desc" : "asc");
    return `/subscriptions?${next.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Inventory of every subscription managed by Platform Operations."
        actions={
          user?.canEdit ? (
            <Link href="/subscriptions/new" className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">
              + New subscription
            </Link>
          ) : undefined
        }
      />

      <form method="get" className="mb-4 rounded-xl border border-border bg-surface p-4" role="search">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input name="q" defaultValue={params.q} placeholder="Search name or vendor" aria-label="Search name or vendor" className={inputCls} />
          <Select name="status" label="Status" value={params.status} options={STATUSES} />
          <Select name="category" label="Category" value={params.category} options={CATEGORIES} />
          <Select name="frequency" label="Billing frequency" value={params.frequency} options={FREQUENCIES} />
          <Select name="product" label="Product" value={params.productId} options={options.products} />
          <Select name="team" label="Team" value={params.teamId} options={options.teams} />
          <Select name="owner" label="Owner" value={params.ownerId} options={options.owners} />
          <Select name="card" label="Payment card" value={params.cardId} options={options.cards} />
          <input name="currency" defaultValue={params.currency} maxLength={3} placeholder="Currency (e.g. USD)" aria-label="Currency" className={`${inputCls} uppercase`} />
          <Select
            name="autoRenew"
            label="Auto-renewal"
            value={params.autoRenew}
            options={[
              { value: "yes", label: "Auto-renews" },
              { value: "no", label: "Does not auto-renew" },
              { value: "unknown", label: "Unknown" },
            ]}
          />
          <div className="flex gap-2 lg:col-span-2 lg:justify-end">
            <button className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">Apply filters</button>
            {filtersActive && (
              <Link href="/subscriptions" className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-background">
                Clear
              </Link>
            )}
          </div>
        </div>
      </form>

      {!anyExist ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
          <p className="text-sm font-medium">No subscriptions registered yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Add the first subscription to start tracking renewals and costs.
          </p>
          {user?.canEdit && (
            <Link href="/subscriptions/new" className="mt-4 inline-block rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground">
              + New subscription
            </Link>
          )}
        </div>
      ) : result.rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm">
          <p className="font-medium">No subscriptions match these filters</p>
          <Link href="/subscriptions" className="mt-2 inline-block text-accent underline">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[980px] text-left text-sm">
            <caption className="sr-only">Subscription inventory</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th><SortLink href={sortHref("name")} active={params.sort === "name" || !params.sort} dir={params.dir}>Subscription</SortLink></Th>
                <Th>Product · Team</Th>
                <Th>Billing</Th>
                <Th><SortLink href={sortHref("cost")} active={params.sort === "cost"} dir={params.dir}>Monthly cost</SortLink></Th>
                <Th><SortLink href={sortHref("renewal")} active={params.sort === "renewal"} dir={params.dir}>Next renewal</SortLink></Th>
                <Th><SortLink href={sortHref("status")} active={params.sort === "status"} dir={params.dir}>Status</SortLink></Th>
                <Th>Auto-renew</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.rows.map((row) => (
                <Row key={row.id} row={row} today={today} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.total > 0 && (
        <Pagination page={result.page} pageSize={PAGE_SIZE} total={result.total} params={urlParams} basePath="/subscriptions" />
      )}
    </>
  );
}

function Row({ row, today }: { row: InventoryRow; today: string }) {
  const risk = renewalRisk({
    nextRenewalDate: row.next_renewal_date,
    cancellationNoticeDays: row.cancellation_notice_days,
    today,
  });
  const archived = row.status === "archived";
  return (
    <tr className={archived ? "opacity-60" : undefined}>
      <td className="px-4 py-3">
        <Link href={`/subscriptions/${row.id}`} className="font-medium text-accent hover:underline">
          {row.name}
        </Link>
        <div className="text-xs text-muted">{row.vendor} · {categoryLabel(row.category)}</div>
      </td>
      <td className="px-4 py-3">
        <div>{row.product_name ?? <span className="text-muted">—</span>}</div>
        <div className="text-xs text-muted">{row.team_name ?? "No team"}</div>
      </td>
      <td className="px-4 py-3">
        {row.current_amount ? (
          <>
            <div>{formatMoney(row.current_amount, row.current_currency)}</div>
            <div className="text-xs text-muted">{frequencyLabel(row.current_frequency)}</div>
          </>
        ) : (
          <Badge glyph="?">No current price</Badge>
        )}
      </td>
      <td className="px-4 py-3">
        {row.current_normalized_monthly ? (
          formatMoney(row.current_normalized_monthly, row.current_currency)
        ) : row.current_frequency === "one_time" ? (
          <span className="text-xs text-muted">One-time (not recurring)</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div>{formatDate(row.next_renewal_date)}</div>
        {!archived && <RenewalBadge risk={risk} />}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-4 py-3">{row.auto_renew == null ? <span className="text-muted">Unknown</span> : row.auto_renew ? "Yes" : "No"}</td>
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th scope="col" className="px-4 py-3 font-medium">{children}</th>;
}

function SortLink({ href, active, dir, children }: { href: string; active: boolean; dir?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 hover:text-foreground" aria-label={`Sort by ${String(children)}`}>
      {children}
      {active && <span aria-hidden>{dir === "desc" ? "↓" : "↑"}</span>}
    </Link>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select name={name} defaultValue={value ?? ""} aria-label={label} className={inputCls}>
      <option value="">{label}: all</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
