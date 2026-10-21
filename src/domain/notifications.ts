import { timingSafeEqual } from "node:crypto";
import type { AlertSeverity } from "@/lib/supabase/database.types";

export const MAX_DELIVERY_ATTEMPTS = 3;
export const ALERTS_PER_MESSAGE = 15;
export const MAX_MESSAGES_PER_RUN = 5;

export type ChatAlert = {
  id: string;
  title: string;
  detail: string | null;
  severity: AlertSeverity;
  subscription_id: string | null;
  payment_method_id: string | null;
};

const ICON: Record<AlertSeverity, string> = { critical: "🔴", warning: "🟠", info: "🔵" };
const ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Strips characters Google Chat would interpret as formatting or mentions, from user-entered text. */
function plain(text: string): string {
  return text.replace(/[*_~`<>]/g, "").replace(/@(all|here)\b/gi, "@​$1").slice(0, 300);
}

function link(appUrl: string, a: ChatAlert): string {
  const base = appUrl.replace(/\/$/, "");
  if (a.subscription_id) return `${base}/subscriptions/${a.subscription_id}`;
  if (a.payment_method_id) return `${base}/payment-methods`;
  return `${base}/alerts`;
}

/** One digest message for a batch of alerts: most severe first, each with a link back to the portal. */
export function buildChatMessage(alerts: ChatAlert[], appUrl: string, part?: { index: number; total: number }): { text: string } {
  const sorted = [...alerts].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.title.localeCompare(b.title));
  const head = `*Subscription Monitoring: ${alerts.length} alert${alerts.length === 1 ? "" : "s"}*${part && part.total > 1 ? ` (${part.index}/${part.total})` : ""}`;
  const lines = sorted.map((a) => `${ICON[a.severity]} <${link(appUrl, a)}|${plain(a.title)}>${a.detail ? `\n    ${plain(a.detail)}` : ""}`);
  return { text: [head, ...lines].join("\n") };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Constant-time check of "Authorization: Bearer <secret>". A missing secret never authorizes anything. */
export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Error text safe to store: no URLs (the webhook URL is a secret) and bounded length. */
export function sanitizeError(message: string): string {
  return message.replace(/https?:\/\/\S+/gi, "[url]").replace(/\s+/g, " ").trim().slice(0, 300);
}
