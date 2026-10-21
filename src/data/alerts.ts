import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AlertStatus, NotificationDeliveryRow, SubscriptionAlertRow } from "@/lib/supabase/database.types";

export const ALERT_PAGE_SIZE = 50;

export type AlertView = SubscriptionAlertRow & {
  subscription_name: string | null;
  card_label: string | null;
  acknowledged_by_name: string | null;
};

export async function countAlertsByStatus(): Promise<Record<AlertStatus, number>> {
  const supabase = await createClient();
  const counts: Record<AlertStatus, number> = { open: 0, acknowledged: 0, resolved: 0 };
  await Promise.all(
    (Object.keys(counts) as AlertStatus[]).map(async (s) => {
      const { count } = await supabase.from("subscription_alerts").select("id", { count: "exact", head: true }).eq("status", s);
      counts[s] = count ?? 0;
    }),
  );
  return counts;
}

/** Persisted alerts (created by the daily job), newest first, with the names people recognise. */
export async function listAlerts(status: AlertStatus | "all"): Promise<AlertView[]> {
  const supabase = await createClient();
  let q = supabase.from("subscription_alerts").select("*").order("created_at", { ascending: false }).limit(ALERT_PAGE_SIZE);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(`Could not load alerts: ${error.message}`);
  const rows = data ?? [];

  const subIds = [...new Set(rows.map((r) => r.subscription_id).filter((x): x is string => !!x))];
  const cardIds = [...new Set(rows.map((r) => r.payment_method_id).filter((x): x is string => !!x))];
  const userIds = [...new Set(rows.map((r) => r.acknowledged_by).filter((x): x is string => !!x))];

  const [subs, cards, users] = await Promise.all([
    subIds.length ? supabase.from("subscriptions").select("id, name").in("id", subIds) : Promise.resolve({ data: [] }),
    cardIds.length ? supabase.from("payment_methods").select("id, label, last_four").in("id", cardIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("user_profiles").select("id, display_name, email").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const subName = new Map((subs.data ?? []).map((s) => [s.id, s.name]));
  const cardName = new Map((cards.data ?? []).map((c) => [c.id, `${c.label} •••• ${c.last_four}`]));
  const userName = new Map((users.data ?? []).map((u) => [u.id, u.display_name ?? u.email]));

  return rows.map((r) => ({
    ...r,
    subscription_name: r.subscription_id ? (subName.get(r.subscription_id) ?? null) : null,
    card_label: r.payment_method_id ? (cardName.get(r.payment_method_id) ?? null) : null,
    acknowledged_by_name: r.acknowledged_by ? (userName.get(r.acknowledged_by) ?? null) : null,
  }));
}

export type DeliveryView = NotificationDeliveryRow & { alert_title: string | null };

/** Delivery attempts, newest first. RLS limits this to editors and admins. */
export async function listDeliveries(limit = 50): Promise<DeliveryView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("notification_deliveries").select("*").order("attempted_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Could not load delivery log: ${error.message}`);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.alert_id))];
  const { data: alerts } = ids.length ? await supabase.from("subscription_alerts").select("id, title").in("id", ids) : { data: [] };
  const title = new Map((alerts ?? []).map((a) => [a.id, a.title]));
  return rows.map((r) => ({ ...r, alert_title: title.get(r.alert_id) ?? null }));
}

/** Alerts raised for one subscription (any status), newest first. */
export async function listAlertsForSubscription(subscriptionId: string, limit = 20): Promise<SubscriptionAlertRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_alerts")
    .select("*")
    .eq("subscription_id", subscriptionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load alerts: ${error.message}`);
  return data ?? [];
}
