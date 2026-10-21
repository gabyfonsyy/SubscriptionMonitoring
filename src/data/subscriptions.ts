import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  AuditLogRow,
  CostHistoryRow,
  InventoryRow,
  SubscriptionDocumentRow,
} from "@/lib/supabase/database.types";
import type { DuplicateMatch } from "@/domain/duplicates";
import { findPotentialDuplicates } from "@/domain/duplicates";

export const PAGE_SIZE = 20;

export type InventorySort = "name" | "vendor" | "cost" | "renewal" | "status" | "updated";

const SORT_COLUMNS: Record<InventorySort, string> = {
  name: "name",
  vendor: "vendor",
  cost: "current_normalized_monthly",
  renewal: "next_renewal_date",
  status: "status",
  updated: "updated_at",
};

export type InventoryFilters = {
  q?: string;
  status?: string;
  category?: string;
  productId?: string;
  teamId?: string;
  ownerId?: string;
  frequency?: string;
  currency?: string;
  autoRenew?: string; // yes | no | unknown
  cardId?: string;
  sort?: string;
  dir?: string;
  page?: number;
};

/** Strips characters that have meaning in PostgREST filter syntax or LIKE patterns. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()%*_\\"']/g, " ").trim().slice(0, 100);
}

export async function listInventory(filters: InventoryFilters) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const sort = (filters.sort && filters.sort in SORT_COLUMNS ? filters.sort : "name") as InventorySort;
  const ascending = filters.dir !== "desc";

  let q = supabase.from("subscription_inventory").select("*", { count: "exact" });

  // Archived subscriptions are hidden by default but remain reachable via the status filter.
  if (filters.status) q = q.eq("status", filters.status as InventoryRow["status"]);
  else q = q.neq("status", "archived");

  if (filters.category) q = q.eq("category", filters.category as InventoryRow["category"]);
  if (filters.productId) q = q.eq("product_id", filters.productId);
  if (filters.teamId) q = q.eq("responsible_team_id", filters.teamId);
  if (filters.ownerId) q = q.eq("owner_id", filters.ownerId);
  if (filters.frequency) q = q.eq("billing_frequency", filters.frequency as InventoryRow["billing_frequency"]);
  if (filters.currency) q = q.eq("current_currency", filters.currency.toUpperCase());
  if (filters.cardId) q = q.eq("payment_method_id", filters.cardId);
  if (filters.autoRenew === "yes") q = q.eq("auto_renew", true);
  else if (filters.autoRenew === "no") q = q.eq("auto_renew", false);
  else if (filters.autoRenew === "unknown") q = q.is("auto_renew", null);

  const search = filters.q ? sanitizeSearch(filters.q) : "";
  if (search) q = q.or(`name.ilike.%${search}%,vendor.ilike.%${search}%`);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await q
    .order(SORT_COLUMNS[sort], { ascending, nullsFirst: false })
    .order("name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw new Error(`Could not load subscriptions: ${error.message}`);
  return { rows: (data ?? []) as InventoryRow[], total: count ?? 0, page, pageSize: PAGE_SIZE };
}

/** True when the table has no subscriptions at all (distinguishes "empty" from "no matches"). */
export async function hasAnySubscription(): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Could not load subscriptions: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function getSubscription(id: string): Promise<InventoryRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("subscription_inventory").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load subscription: ${error.message}`);
  return (data as InventoryRow | null) ?? null;
}

export async function getCostHistory(subscriptionId: string): Promise<CostHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_cost_history")
    .select("*")
    .eq("subscription_id", subscriptionId)
    .order("effective_from", { ascending: false });
  if (error) throw new Error(`Could not load cost history: ${error.message}`);
  return data ?? [];
}

export async function getDocuments(subscriptionId: string): Promise<SubscriptionDocumentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_documents")
    .select("*")
    .eq("subscription_id", subscriptionId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load documents: ${error.message}`);
  return data ?? [];
}

export async function getAuditTrail(subscriptionId: string): Promise<AuditLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("entity_table", "subscriptions")
    .eq("entity_id", subscriptionId)
    .order("occurred_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(`Could not load audit history: ${error.message}`);
  return data ?? [];
}

/** Audited edits to price records (corrections), shown alongside the subscription's own history. */
export async function getCostAudit(costIds: string[]): Promise<AuditLogRow[]> {
  if (costIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("entity_table", "subscription_cost_history")
    .in("entity_id", costIds)
    .eq("action", "update")
    .order("occurred_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(`Could not load price audit history: ${error.message}`);
  return data ?? [];
}

/** Advisory duplicate check against all non-archived subscriptions. */
export async function findDuplicatesFor(candidate: {
  id?: string;
  name: string;
  vendor: string;
}): Promise<DuplicateMatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, name, vendor")
    .is("archived_at", null);
  if (error) throw new Error(`Could not check for duplicates: ${error.message}`);
  return findPotentialDuplicates(candidate, data ?? []);
}
