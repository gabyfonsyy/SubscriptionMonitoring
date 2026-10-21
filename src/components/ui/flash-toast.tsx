"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

const MESSAGES: Record<string, string> = {
  created: "Subscription created.",
  updated: "Changes saved.",
  archived: "Subscription archived. Its history is preserved.",
  restored: "Subscription restored.",
  doc_added: "Document link added.",
  doc_removed: "Document link removed.",
  price_recorded: "Price change recorded.",
  price_corrected: "Price record corrected. The change is in the audit trail.",
  rate_saved: "Exchange rate saved.",
  rates_imported: "Exchange rates imported.",
  card_saved: "Card saved.",
  card_retired: "Card retired. Linked subscriptions keep their history.",
  card_restored: "Card restored.",
  rule_saved: "Alert rule saved.",
  alert_acknowledged: "Alert acknowledged.",
  alert_resolved: "Alert resolved.",
  alert_open: "Alert reopened.",
  saved: "Saved.",
};

/** Shows a success toast for ?saved=<key> after a redirect, then cleans the URL. */
export function FlashToast() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const key = params.get("saved");

  useEffect(() => {
    if (!key) return;
    toast.success(MESSAGES[key] ?? MESSAGES.saved);
    const next = new URLSearchParams(params.toString());
    next.delete("saved");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [key, params, pathname, router]);

  return null;
}
