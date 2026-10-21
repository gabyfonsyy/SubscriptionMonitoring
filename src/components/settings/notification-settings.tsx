import { ConfirmAction } from "@/components/ui/confirm-dialog";
import { SubmitButton, inputCls } from "@/components/ui/form";
import { runAlertsNowAction, sendTestMessageAction, updateAlertRuleAction } from "@/app/(app)/settings/notify-actions";
import type { AlertRuleRow } from "@/lib/supabase/database.types";

const LABELS: Record<string, string> = {
  renewal_approaching: "Renewal approaching",
  cancellation_deadline: "Cancellation deadline",
  subscription_expiring: "Subscription expiring",
  payment_card_expiring: "Card expiring",
  payment_card_expired: "Card expired",
  cost_increase: "Cost increase",
  marked_for_review: "Marked for review",
  missing_details: "Missing details",
  potential_duplicate: "Potential duplicate",
  newly_registered: "Newly registered",
  delivery_failure: "Delivery failure",
};
// Types whose timing is set by reminder days; the others fire once per event.
const HAS_DAYS = new Set(["renewal_approaching", "cancellation_deadline", "subscription_expiring", "payment_card_expiring"]);

type Notice = { notice?: string; c?: string; s?: string; f?: string; r?: string; chat?: string };

function noticeText(n: Notice): { tone: "ok" | "warn"; text: string } | null {
  switch (n.notice) {
    case "test_sent": return { tone: "ok", text: "Test message sent to Google Chat." };
    case "test_failed": return { tone: "warn", text: "The test message could not be delivered. Check that the webhook URL is correct and the space still exists." };
    case "forbidden": return { tone: "warn", text: "Only an admin can do that." };
    case "rule_invalid": return { tone: "warn", text: "Reminder days must be up to 6 whole numbers between 0 and 365." };
    case "rule_failed": return { tone: "warn", text: "The rule could not be saved." };
    case "run_failed": return { tone: "warn", text: "The alert run failed. See the server log." };
    case "run":
      return {
        tone: Number(n.f) > 0 ? "warn" : "ok",
        text: `Alert run finished: ${n.c ?? 0} new, ${n.r ?? 0} auto-resolved, ${n.s ?? 0} sent, ${n.f ?? 0} failed.${n.chat === "0" ? " Google Chat is not configured, so nothing was sent." : ""}`,
      };
    default: return null;
  }
}

export function NotificationSettings({
  status,
  isAdmin,
  rules,
  notice,
}: {
  status: { googleChatConfigured: boolean; cronSecretConfigured: boolean; serviceRoleConfigured: boolean };
  isAdmin: boolean;
  rules: AlertRuleRow[];
  notice: Notice;
}) {
  const msg = noticeText(notice);
  return (
    <section className="mb-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Notifications</h2>
      <p className="mb-3 mt-1 text-sm text-muted">
        A daily check creates alerts and posts one digest to Google Chat. Each alert is sent once; failed sends are retried on later runs.
      </p>

      {msg && (
        <p role="status" className={`mb-3 rounded-md border p-3 text-sm ${msg.tone === "ok" ? "border-ok/30 bg-ok-wash" : "border-warn/30 bg-warn-wash"}`}>{msg.text}</p>
      )}

      <ul className="mb-4 space-y-1 text-sm">
        <Row label="Google Chat webhook (GOOGLE_CHAT_WEBHOOK_URL)" ok={status.googleChatConfigured} />
        <Row label="Cron secret (CRON_SECRET)" ok={status.cronSecretConfigured} />
        <Row label="Server database access (SUPABASE_SERVICE_ROLE_KEY)" ok={status.serviceRoleConfigured} />
      </ul>
      {!status.googleChatConfigured && (
        <p className="mb-4 text-xs text-muted">Add the webhook URL to <span className="font-mono">.env.local</span> (and Vercel&apos;s environment settings in production), then restart the server. Values are never shown here.</p>
      )}

      {isAdmin && (
        <div className="mb-5 flex flex-wrap gap-2">
          <ConfirmAction action={sendTestMessageAction} trigger="Send test message" title="Send a test message?" description="Posts one short message to the configured Google Chat space." confirmLabel="Send" />
          <ConfirmAction action={runAlertsNowAction} trigger="Run alert check now" title="Run the alert check now?" description="Does what the daily job does: creates any new alerts and sends them to Google Chat. Alerts already sent are not sent again." confirmLabel="Run now" />
        </div>
      )}

      <h3 className="mb-2 text-sm font-medium">Alert rules</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Alert rules</caption>
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">Alert</th>
              <th scope="col" className="py-2 pr-4 font-medium">On</th>
              <th scope="col" className="py-2 font-medium">Remind (days before)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rules.map((r) => (
              <tr key={r.alert_type}>
                <th scope="row" className="py-2 pr-4 text-left font-normal">{LABELS[r.alert_type] ?? r.alert_type}</th>
                {isAdmin ? (
                  <td colSpan={2} className="py-1.5">
                    <form action={updateAlertRuleAction.bind(null, r.alert_type)} className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={r.enabled} /><span className="sr-only">Enabled</span></label>
                      {HAS_DAYS.has(r.alert_type) ? (
                        <input name="reminder_days" defaultValue={r.reminder_days.join(", ")} aria-label={`${LABELS[r.alert_type]} reminder days`} placeholder="30, 14, 7" className={`${inputCls} max-w-40`} />
                      ) : (
                        <span className="text-xs text-muted">once per event</span>
                      )}
                      <SubmitButton variant="secondary" pendingText="Saving…" className="px-2 py-1 text-xs">Save</SubmitButton>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="py-2 pr-4">{r.enabled ? "On" : "Off"}</td>
                    <td className="py-2">{HAS_DAYS.has(r.alert_type) ? r.reminder_days.join(", ") || "—" : "once per event"}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className={ok ? "text-ok" : "text-warn"}>{ok ? "● Configured" : "▲ Not configured"}</span>
    </li>
  );
}
