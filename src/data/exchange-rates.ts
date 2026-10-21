import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ExchangeRateRow } from "@/lib/supabase/database.types";

/** Newest first. Rates are small in number (a few currency pairs over time), so no paging yet. */
export async function listExchangeRates(): Promise<ExchangeRateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("*")
    .order("effective_date", { ascending: false })
    .order("base_currency")
    .limit(1000);
  if (error) throw new Error(`Could not load exchange rates: ${error.message}`);
  return data ?? [];
}
