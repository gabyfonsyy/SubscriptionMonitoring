import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env.server";
import { getPublicEnv } from "@/lib/env";
import { alertsToResolve, evaluateAlerts, type EngineCostRow, type EngineSubscription } from "@/domain/alert-engine";
import {
  ALERTS_PER_MESSAGE,
  MAX_DELIVERY_ATTEMPTS,
  MAX_MESSAGES_PER_RUN,
  buildChatMessage,
  chunk,
  sanitizeError,
  type ChatAlert,
} from "@/domain/notifications";
import { todayISO } from "@/lib/date";
import type { AlertType } from "@/lib/supabase/database.types";

export type RunSummary = {
  evaluated: number;
  created: number;
  resolved: number;
  sent: number;
  failed: number;
  chatConfigured: boolean;
  messages: number;
};

/** Posts to the Google Chat webhook. The URL is a secret: it is never logged or stored. */
export async function postToChat(text: string): Promise<{ ok: boolean; status: number | null; error?: string }> {
  const url = getServerEnv().GOOGLE_CHAT_WEBHOOK_URL;
  if (!url) return { ok: false, status: null, error: "Google Chat webhook is not configured." };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `Google Chat responded with HTTP ${res.status}.` };
  } catch (e) {
    return { ok: false, status: null, error: sanitizeError(e instanceof Error ? e.message : "Request failed.") };
  }
}

/**
 * Evaluate -> persist (idempotent) -> auto-resolve stale -> deliver one digest per chunk.
 * Safe to run any number of times a day: alerts are keyed by dedupe_key, and an alert already
 * delivered is never sent again. Failed deliveries are retried on later runs up to MAX_DELIVERY_ATTEMPTS.
 */
export async function runAlertCycle(now = new Date()): Promise<RunSummary> {
  const db = createAdminClient();
  const today = todayISO("Asia/Manila", now);
  const chatConfigured = Boolean(getServerEnv().GOOGLE_CHAT_WEBHOOK_URL);

  const [subsRes, cardsRes, costRes, rulesRes] = await Promise.all([
    db.from("subscriptions").select("id, name, vendor, product_id, status, billing_frequency, auto_renew, next_renewal_date, cancellation_notice_days, expiration_date, owner_id, payment_method_id, created_at, archived_at").limit(5000),
    db.from("payment_methods").select("id, label, last_four, expiry_month, expiry_year, retired_at").limit(2000),
    db.from("subscription_cost_history").select("id, subscription_id, effective_from, effective_to, amount, currency, billing_frequency, normalized_monthly, change_type").limit(20000),
    db.from("alert_rules").select("alert_type, enabled, reminder_days"),
  ]);
  for (const r of [subsRes, cardsRes, costRes, rulesRes]) if (r.error) throw new Error("Could not load data for the alert run.");

  // Current price comes from the open period; the engine only needs to know whether one exists.
  const currentPrice = new Map<string, string>();
  for (const h of costRes.data ?? []) {
    if (h.effective_from <= today && (h.effective_to == null || h.effective_to >= today)) currentPrice.set(h.subscription_id, String(h.amount));
  }
  const subscriptions: EngineSubscription[] = (subsRes.data ?? []).map((s) => ({ ...s, current_amount: currentPrice.get(s.id) ?? null }));
  const cards = cardsRes.data ?? [];

  const candidates = evaluateAlerts({
    subscriptions,
    cards,
    costHistory: (costRes.data ?? []) as EngineCostRow[],
    rules: rulesRes.data ?? [],
    today,
  });

  // 1. Persist. ignoreDuplicates => ON CONFLICT (dedupe_key) DO NOTHING; only new rows come back.
  let created = 0;
  if (candidates.length > 0) {
    const { data, error } = await db
      .from("subscription_alerts")
      .upsert(candidates, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error("Could not save alerts.");
    created = data?.length ?? 0;
  }

  // 2. Auto-resolve alerts that no longer describe a real situation.
  const { data: open, error: openError } = await db
    .from("subscription_alerts")
    .select("id, alert_type, subscription_id, payment_method_id, due_date")
    .eq("status", "open")
    .limit(5000);
  if (openError) throw new Error("Could not read open alerts.");
  const staleIds = alertsToResolve(open ?? [], subscriptions, cards, today);
  if (staleIds.length > 0) {
    await db.from("subscription_alerts").update({ status: "resolved", resolved_at: now.toISOString() }).in("id", staleIds);
  }

  const summary: RunSummary = { evaluated: candidates.length, created, resolved: staleIds.length, sent: 0, failed: 0, chatConfigured, messages: 0 };
  if (!chatConfigured) return summary;

  // 3. Deliver: open alerts of enabled types that have not been sent and still have attempts left.
  const enabled = new Set<AlertType>((rulesRes.data ?? []).filter((r) => r.enabled).map((r) => r.alert_type));
  const stale = new Set(staleIds);
  const pending = (open ?? []).filter((a) => !stale.has(a.id) && a.alert_type !== "delivery_failure" && enabled.has(a.alert_type));
  if (pending.length === 0) return summary;

  const ids = pending.map((a) => a.id);
  const { data: deliveries, error: delError } = await db.from("notification_deliveries").select("alert_id, status, attempt").in("alert_id", ids).limit(20000);
  if (delError) throw new Error("Could not read delivery history.");
  const sentIds = new Set((deliveries ?? []).filter((d) => d.status === "sent").map((d) => d.alert_id));
  const attempts = new Map<string, number>();
  for (const d of deliveries ?? []) attempts.set(d.alert_id, Math.max(attempts.get(d.alert_id) ?? 0, d.attempt));
  const todo = ids.filter((id) => !sentIds.has(id) && (attempts.get(id) ?? 0) < MAX_DELIVERY_ATTEMPTS);
  if (todo.length === 0) return summary;

  const { data: full, error: fullError } = await db
    .from("subscription_alerts")
    .select("id, title, detail, severity, subscription_id, payment_method_id")
    .in("id", todo);
  if (fullError) throw new Error("Could not read alerts to send.");

  const appUrl = getPublicEnv()?.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const batches = chunk((full ?? []) as ChatAlert[], ALERTS_PER_MESSAGE).slice(0, MAX_MESSAGES_PER_RUN);
  for (const [i, batch] of batches.entries()) {
    const res = await postToChat(buildChatMessage(batch, appUrl, { index: i + 1, total: batches.length }).text);
    summary.messages++;
    const rows = batch.map((a) => ({
      alert_id: a.id,
      channel: "google_chat" as const,
      attempt: (attempts.get(a.id) ?? 0) + 1,
      status: res.ok ? ("sent" as const) : ("failed" as const),
      http_status: res.status,
      error_message: res.ok ? null : sanitizeError(res.error ?? "Delivery failed."),
    }));
    await db.from("notification_deliveries").insert(rows);
    if (res.ok) summary.sent += batch.length;
    else summary.failed += batch.length;
  }

  // 4. Surface permanent failures in the portal (not via Chat, which is what is failing).
  if (summary.failed > 0) {
    await db.from("subscription_alerts").upsert(
      {
        alert_type: "delivery_failure" as const,
        severity: "warning" as const,
        title: "Google Chat notifications are failing",
        detail: `${summary.failed} alert(s) could not be delivered on ${today}. Check the webhook in Settings; delivery is retried on the next run (up to ${MAX_DELIVERY_ATTEMPTS} attempts each).`,
        dedupe_key: `delivery_failure:${today}`,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
  }
  return summary;
}
