"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { postToChat, runAlertCycle } from "@/lib/alerts/run";
import type { AlertType } from "@/lib/supabase/database.types";

const RULE_TYPES: AlertType[] = ["renewal_approaching", "cancellation_deadline", "subscription_expiring", "payment_card_expiring", "payment_card_expired", "cost_increase", "marked_for_review", "missing_details", "potential_duplicate", "newly_registered", "delivery_failure"];

async function admin() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/settings?notice=forbidden");
  return user;
}

export async function sendTestMessageAction() {
  await admin();
  const res = await postToChat("✅ Subscription Monitoring test message. Notifications are working.");
  redirect(`/settings?notice=${res.ok ? "test_sent" : "test_failed"}`);
}

/** Runs the same cycle the daily cron runs. Idempotent, so pressing it twice is harmless. */
export async function runAlertsNowAction() {
  await admin();
  let q: string;
  try {
    const r = await runAlertCycle();
    q = `notice=run&c=${r.created}&s=${r.sent}&f=${r.failed}&r=${r.resolved}&chat=${r.chatConfigured ? 1 : 0}`;
  } catch {
    q = "notice=run_failed";
  }
  revalidatePath("/alerts");
  redirect(`/settings?${q}`);
}

export async function updateAlertRuleAction(alertType: string, formData: FormData) {
  const user = await admin();
  const type = RULE_TYPES.find((t) => t === alertType);
  if (!type) redirect("/settings?notice=rule_failed");
  const enabled = formData.get("enabled") === "on";
  const days = String(formData.get("reminder_days") ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .map(Number);
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 365) || days.length > 6) redirect("/settings?notice=rule_invalid");

  const supabase = await createClient();
  const { error } = await supabase
    .from("alert_rules")
    .update({ enabled, reminder_days: [...new Set(days)].sort((a, b) => b - a), updated_by: user.id })
    .eq("alert_type", type);
  if (error) redirect("/settings?notice=rule_failed");

  revalidatePath("/settings");
  redirect("/settings?saved=rule_saved");
}
