import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PaymentMethodRow } from "@/lib/supabase/database.types";

export type LinkedSubscription = {
  id: string;
  name: string;
  vendor: string;
  status: string;
  payment_method_id: string;
};

export async function listCardsWithSubscriptions(): Promise<{
  cards: PaymentMethodRow[];
  linked: Map<string, LinkedSubscription[]>;
}> {
  const supabase = await createClient();
  const [cardsRes, subsRes] = await Promise.all([
    supabase.from("payment_methods").select("*").order("label"),
    supabase
      .from("subscription_inventory")
      .select("id, name, vendor, status, payment_method_id")
      .not("payment_method_id", "is", null)
      .order("name")
      .limit(5000),
  ]);
  if (cardsRes.error) throw new Error(`Could not load payment methods: ${cardsRes.error.message}`);
  if (subsRes.error) throw new Error(`Could not load linked subscriptions: ${subsRes.error.message}`);

  const linked = new Map<string, LinkedSubscription[]>();
  for (const s of (subsRes.data ?? []) as LinkedSubscription[]) {
    linked.set(s.payment_method_id, [...(linked.get(s.payment_method_id) ?? []), s]);
  }
  return { cards: cardsRes.data ?? [], linked };
}
