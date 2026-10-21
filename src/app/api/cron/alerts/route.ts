import { NextResponse } from "next/server";
import { runAlertCycle } from "@/lib/alerts/run";
import { isAuthorizedCron } from "@/domain/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily alert cycle, called by Vercel Cron with "Authorization: Bearer <CRON_SECRET>".
 * Idempotent, so a retried or double-fired run does not duplicate alerts or messages.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runAlertCycle()) });
  } catch (e) {
    // Message is a fixed, non-sensitive string from runAlertCycle; details stay in server logs.
    console.error("alert cycle failed", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ ok: false, error: "The alert run failed." }, { status: 500 });
  }
}
