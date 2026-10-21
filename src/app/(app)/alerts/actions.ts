"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForbiddenError, requireEditor } from "@/lib/auth";
import type { AlertStatus } from "@/lib/supabase/database.types";

const STATUSES: AlertStatus[] = ["open", "acknowledged", "resolved"];

/**
 * Moves an alert between open / acknowledged / resolved. Who and when are recorded; nothing is deleted.
 * A resolved alert is not recreated by the daily job (it is keyed per event), so resolving is permanent
 * for that event until someone reopens it.
 */
export async function setAlertStatusAction(alertId: string, next: string, formData: FormData) {
  let user;
  try {
    user = await requireEditor();
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/alerts?tab=alerts&notice=forbidden");
    throw e;
  }
  const status = STATUSES.find((s) => s === next);
  if (!status) redirect("/alerts?tab=alerts&notice=failed");

  const now = new Date().toISOString();
  const patch =
    status === "acknowledged"
      ? { status, acknowledged_by: user.id, acknowledged_at: now, resolved_by: null, resolved_at: null }
      : status === "resolved"
        ? { status, resolved_by: user.id, resolved_at: now }
        : { status, acknowledged_by: null, acknowledged_at: null, resolved_by: null, resolved_at: null };

  const supabase = await createClient();
  const { data, error } = await supabase.from("subscription_alerts").update(patch).eq("id", alertId).select("id");
  if (error || !data || data.length === 0) redirect("/alerts?tab=alerts&notice=failed");

  // Stay on the same filter the user was looking at.
  const back = String(formData.get("status") ?? "open");
  revalidatePath("/alerts");
  redirect(`/alerts?tab=alerts&status=${STATUSES.includes(back as AlertStatus) || back === "all" ? back : "open"}&saved=alert_${status}`);
}
