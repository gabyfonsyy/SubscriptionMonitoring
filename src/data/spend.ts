import "server-only";
import Decimal from "decimal.js";
import { createClient } from "@/lib/supabase/server";

/** Current normalized monthly spend of non-archived subscriptions, summed per currency (never mixed). */
export async function getCurrentRecurringSpend(): Promise<Map<string, Decimal>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_inventory")
    .select("current_currency, current_normalized_monthly")
    .neq("status", "archived")
    .not("current_normalized_monthly", "is", null)
    .limit(5000);
  if (error) throw new Error(`Could not load spend: ${error.message}`);
  const totals = new Map<string, Decimal>();
  for (const r of data ?? []) {
    if (!r.current_currency || r.current_normalized_monthly == null) continue;
    totals.set(r.current_currency, (totals.get(r.current_currency) ?? new Decimal(0)).plus(String(r.current_normalized_monthly)));
  }
  return totals;
}
