import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CostHistoryRow, InventoryRow } from "@/lib/supabase/database.types";

/** Every subscription (including archived) with today's price. Small internal dataset, so one query. */
export async function listAllInventory(): Promise<InventoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("subscription_inventory").select("*").order("name").limit(5000);
  if (error) throw new Error(`Could not load subscriptions: ${error.message}`);
  return (data ?? []) as InventoryRow[];
}

export async function listAllCostHistory(): Promise<CostHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_cost_history")
    .select("*")
    .order("subscription_id")
    .order("effective_from")
    .limit(20000);
  if (error) throw new Error(`Could not load cost history: ${error.message}`);
  return data ?? [];
}

export function groupHistory(rows: CostHistoryRow[]): Map<string, CostHistoryRow[]> {
  const m = new Map<string, CostHistoryRow[]>();
  for (const r of rows) m.set(r.subscription_id, [...(m.get(r.subscription_id) ?? []), r]);
  return m;
}
