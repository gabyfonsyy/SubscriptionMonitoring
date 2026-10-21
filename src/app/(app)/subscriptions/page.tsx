import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, EmptyState } from "@/components/ui/panel";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/subscriptions/badges";
import { Status, type Tone } from "@/components/ui/badge";
import { KebabMenu } from "@/components/ui/kebab-menu";
import { LinkButton, buttonCls } from "@/components/ui/button";
import { inputCls } from "@/components/ui/form";
import { table, tableWrap, tbody, td, tdRight, th, thRight, thead, tr } from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth";
import { hasAnySubscription, listInventory, PAGE_SIZE, type InventoryFilters } from "@/data/subscriptions";
import { loadFormOptions } from "@/data/reference";
import { CATEGORIES, FREQUENCIES, STATUSES, categoryLabel, frequencyLabel } from "@/domain/constants";
import { buildAttentionQueue, type AttentionItem } from "@/domain/attention";
import { renewalRisk } from "@/domain/renewals";
import { todayISO } from "@/lib/date";
import { formatDate, formatMoney } from "@/lib/format";
import type { InventoryRow } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Subscriptions" };

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const AUTO_RENEW = [
  { value: "yes", label: "Auto-renews" },
  { value: "no", label: "Does not auto-renew" },
  { value: "unknown", label: "Unknown" },
];

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
  const canEdit = !!user?.canEdit;

  // Query-string for links that keep current filters (sort headers, pagination, filter chips).
  const urlParams: Record<string, string | undefined> = {
    q: params.q, status: params.status, category: params.category, product: params.productId,
    team: params.teamId, owner: params.ownerId, frequency: params.frequency, currency: params.currency,
    autoRenew: params.autoRenew, card: params.cardId, sort: params.sort, dir: params.dir,
  };
  const hrefWithout = (drop: string) => {
    const next = new URLSearchParams();
    for (const [k, val] of Object.entries(urlParams)) if (val && k !== drop) next.set(k, val);
    const s = next.toString();
    return s ? `/subscriptions?${s}` : "/subscriptions";
  };
  const sortHref = (col: string) => {
    const next = new URLSearchParams();
    for (const [k, val] of Object.entries(urlParams)) if (val && k !== "sort" && k !== "dir") next.set(k, val);
    next.set("sort", col);
    next.set("dir", params.sort === col && params.dir !== "desc" ? "desc" : "asc");
    return `/subscriptions?${next.toString()}`;
  };

  // Active-filter chips, each removable on its own.
  const optLabel = (list: { value: string; label: string }[], v?: string) => list.find((o) => o.value === v)?.label ?? v;
  const chips = [
    params.q && { key: "q", text: `“${params.q}”` },
    params.status && { key: "status", text: optLabel(STATUSES, params.status) },
    params.category && { key: "category", text: optLabel(CATEGORIES, params.category) },
    params.frequency && { key: "frequency", text: optLabel(FREQUENCIES, params.frequency) },
    params.productId && { key: "product", text: optLabel(options.products, params.productId) },
    params.teamId && { key: "team", text: `Team: ${optLabel(options.teams, params.teamId)}` },
    params.ownerId && { key: "owner", text: `Owner: ${optLabel(options.owners, params.ownerId)}` },
    params.cardId && { key: "card", text: optLabel(options.cards, params.cardId) },
    params.currency && { key: "currency", text: params.currency.toUpperCase() },
    params.autoRenew && { key: "autoRenew", text: optLabel(AUTO_RENEW, params.autoRenew) },
  ].filter((c): c is { key: string; text: string } => !!c && !!c.text);
  const moreOpen = !!(params.productId || params.teamId || params.ownerId || params.cardId || params.currency || params.autoRenew || params.frequency);

  // One attention lookup for the rows on this page.
  const attention = new Map<string, AttentionItem[]>();
  for (const item of buildAttentionQueue(result.rows, today)) attention.set(item.subscriptionId, [...(attention.get(item.subscriptionId) ?? []), item]);

  const sortState = (col: string) => (params.sort === col || (!params.sort && col === "name") ? (params.dir === "desc" ? "descending" : "ascending") : "none");

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description={anyExist ? `${result.total} ${filtersActive(chips) ? "matching" : "in the inventory"}` : "Inventory of every subscription managed by Platform Operations."}
        actions={canEdit ? <LinkButton href="/subscriptions/new" variant="primary">New subscription</LinkButton> : undefined}
      />

      <form method="get" role="search" className="mb-3 rounded-lg border border-border bg-surface p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input name="q" defaultValue={params.q} placeholder="Search name or vendor" aria-label="Search name or vendor" className={`${inputCls} min-w-52 flex-1`} />
          <FilterSelect name="status" label="Status" value={params.status} options={STATUSES} />
          <FilterSelect name="category" label="Category" value={params.category} options={CATEGORIES} />
          <button className={buttonCls("primary")}>Apply</button>
          {chips.length > 0 && <Link href="/subscriptions" className={buttonCls("ghost")}>Reset</Link>}
        </div>
        <details className="group mt-2" open={moreOpen}>
          <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">More filters</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect name="frequency" label="Billing frequency" value={params.frequency} options={FREQUENCIES} />
            <FilterSelect name="product" label="Product" value={params.productId} options={options.products} />
            <FilterSelect name="team" label="Team" value={params.teamId} options={options.teams} />
            <FilterSelect name="owner" label="Owner" value={params.ownerId} options={options.owners} />
            <FilterSelect name="card" label="Payment card" value={params.cardId} options={options.cards} />
            <FilterSelect name="autoRenew" label="Auto-renewal" value={params.autoRenew} options={AUTO_RENEW} />
            <input name="currency" defaultValue={params.currency} maxLength={3} placeholder="Currency (e.g. USD)" aria-label="Currency" className={`${inputCls} uppercase`} />
          </div>
        </details>
        {/* Sorting survives applying filters */}
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}
        {params.dir && <input type="hidden" name="dir" value={params.dir} />}
      </form>

      {chips.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Active filters">
          {chips.map((c) => (
            <li key={c.key}>
              <Link href={hrefWithout(c.key)} className="inline-flex items-center gap-1 rounded-full bg-accent-wash px-2.5 py-0.5 text-xs font-medium text-accent hover:opacity-80" aria-label={`Remove filter ${c.text}`}>
                {c.text} <span aria-hidden>×</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!anyExist ? (
        <EmptyState
          title="No subscriptions registered yet"
          action={canEdit ? <LinkButton href="/subscriptions/new" variant="primary">New subscription</LinkButton> : undefined}
        >
          Add the first subscription to start tracking renewals and costs.
        </EmptyState>
      ) : result.rows.length === 0 ? (
        <EmptyState title="No subscriptions match these filters" action={<LinkButton href="/subscriptions">Reset filters</LinkButton>}>
          Try removing a filter or searching by a different name.
        </EmptyState>
      ) : (
        <Panel flush>
          <div className={tableWrap}>
            <table className={`${table} min-w-[1080px]`}>
              <caption className="sr-only">Subscription inventory</caption>
              <thead className={thead}>
                <tr>
                  <Th sort={sortState("name")}><SortLink href={sortHref("name")} active={params.sort === "name" || !params.sort} dir={params.dir}>Subscription</SortLink></Th>
                  <Th>Product · Team</Th>
                  <Th>Owner</Th>
                  <Th right>Billing</Th>
                  <Th right sort={sortState("cost")}><SortLink href={sortHref("cost")} active={params.sort === "cost"} dir={params.dir}>Monthly cost</SortLink></Th>
                  <Th sort={sortState("renewal")}><SortLink href={sortHref("renewal")} active={params.sort === "renewal"} dir={params.dir}>Next renewal</SortLink></Th>
                  <Th>Auto-renew</Th>
                  <Th sort={sortState("status")}><SortLink href={sortHref("status")} active={params.sort === "status"} dir={params.dir}>Status</SortLink></Th>
                  <Th>Attention</Th>
                  <th scope="col" className={th}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className={tbody}>
                {result.rows.map((row) => (
                  <Row key={row.id} row={row} today={today} canEdit={canEdit} items={attention.get(row.id) ?? []} />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {result.total > 0 && (
        <Pagination page={result.page} pageSize={PAGE_SIZE} total={result.total} params={urlParams} basePath="/subscriptions" />
      )}
    </>
  );
}

const filtersActive = (chips: unknown[]) => chips.length > 0;

const TONE_BY_SEVERITY: Record<string, Tone> = { high: "danger", medium: "warn", low: "neutral" };

function Row({ row, today, canEdit, items }: { row: InventoryRow; today: string; canEdit: boolean; items: AttentionItem[] }) {
  const risk = renewalRisk({ nextRenewalDate: row.next_renewal_date, cancellationNoticeDays: row.cancellation_notice_days, today });
  const archived = row.status === "archived";
  const worst = items[0]; // queue is sorted most severe first
  const rel =
    risk.daysUntilRenewal == null ? null : risk.daysUntilRenewal === 0 ? "today" : risk.daysUntilRenewal > 0 ? `in ${risk.daysUntilRenewal}d` : `${Math.abs(risk.daysUntilRenewal)}d ago`;
  const urgent = !archived && (risk.level === "overdue" || risk.level === "notice_passed");

  return (
    <tr className={`${tr} ${archived ? "opacity-60" : ""}`}>
      <td className={td}>
        <Link href={`/subscriptions/${row.id}`} className="font-medium text-foreground hover:text-accent hover:underline">{row.name}</Link>
        <div className="text-xs text-muted">{row.vendor} · {categoryLabel(row.category)}</div>
      </td>
      <td className={td}>
        <div>{row.product_name ?? <span className="text-faint">—</span>}</div>
        <div className="text-xs text-muted">{row.team_name ?? "No team"}</div>
      </td>
      <td className={`${td} text-muted`}>{row.owner_name ?? <span className="text-warn">Unassigned</span>}</td>
      <td className={tdRight}>
        {row.current_amount ? (
          <>
            <div>{formatMoney(row.current_amount, row.current_currency)}</div>
            <div className="text-xs text-muted">{frequencyLabel(row.current_frequency)}</div>
          </>
        ) : (
          <span className="text-xs text-warn">No price</span>
        )}
      </td>
      <td className={`${tdRight} font-medium`}>
        {row.current_normalized_monthly ? (
          formatMoney(row.current_normalized_monthly, row.current_currency)
        ) : row.current_frequency === "one_time" ? (
          <span className="text-xs font-normal text-muted">One-time</span>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className={`${td} num`}>
        <div>{formatDate(row.next_renewal_date)}</div>
        {rel && !archived && <div className={`text-xs ${urgent ? "font-medium text-danger" : "text-muted"}`}>{urgent && <span aria-hidden>▲ </span>}{rel}</div>}
      </td>
      <td className={td}>{row.auto_renew == null ? <span className="text-faint">Unknown</span> : row.auto_renew ? "Yes" : "No"}</td>
      <td className={td}><StatusBadge status={row.status} /></td>
      <td className={td}>
        {worst ? (
          <span title={items.map((i) => i.message).join("\n")}>
            <Status tone={TONE_BY_SEVERITY[worst.severity]}>
              {items.length} {items.length === 1 ? "item" : "items"}
              <span className="sr-only">: {items.map((i) => i.message).join(" ")}</span>
            </Status>
          </span>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className={`${td} text-right`}>
        <KebabMenu
          label={`Actions for ${row.name}`}
          items={[
            { label: "View details", href: `/subscriptions/${row.id}` },
            { label: "Cost history", href: `/subscriptions/${row.id}?tab=cost` },
            ...(canEdit && !archived ? [{ label: "Edit", href: `/subscriptions/${row.id}/edit` }] : []),
          ]}
        />
      </td>
    </tr>
  );
}

function Th({ children, right, sort }: { children: React.ReactNode; right?: boolean; sort?: string }) {
  return (
    <th scope="col" aria-sort={sort as "ascending" | "descending" | "none" | undefined} className={right ? thRight : th}>
      {children}
    </th>
  );
}

function SortLink({ href, active, dir, children }: { href: string; active: boolean; dir?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 hover:text-foreground" aria-label={`Sort by ${String(children)}`}>
      {children}
      <span aria-hidden className={active ? "" : "text-faint"}>{active ? (dir === "desc" ? "↓" : "↑") : "↕"}</span>
    </Link>
  );
}

function FilterSelect({
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
    <select name={name} defaultValue={value ?? ""} aria-label={label} className={`${inputCls} w-auto min-w-36`}>
      <option value="">{label}: all</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
