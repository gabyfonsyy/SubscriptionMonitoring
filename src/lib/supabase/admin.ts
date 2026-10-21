import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role client. BYPASSES RLS. Use only in trusted server code
 * (cron route, notification service). Never import from client components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service-role credentials are not configured.");
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
