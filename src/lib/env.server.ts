import "server-only";
import { z } from "zod";

/** Server-only secrets. Importing this from a client component fails the build. */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  GOOGLE_CHAT_WEBHOOK_URL: z.string().url().optional(),
  CRON_SECRET: z.string().min(16).optional(),
});

export function getServerEnv() {
  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    GOOGLE_CHAT_WEBHOOK_URL: process.env.GOOGLE_CHAT_WEBHOOK_URL || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
  });
}

/** Safe status for the UI: reports whether a secret exists, never its value. */
export function getIntegrationStatus() {
  const env = getServerEnv();
  return {
    googleChatConfigured: Boolean(env.GOOGLE_CHAT_WEBHOOK_URL),
    serviceRoleConfigured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    cronSecretConfigured: Boolean(env.CRON_SECRET),
  };
}
