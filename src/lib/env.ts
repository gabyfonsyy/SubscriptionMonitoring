import { z } from "zod";

/**
 * Public configuration (safe for the browser). NEXT_PUBLIC_* values must be
 * referenced literally so Next.js can inline them at build time.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN: z.string().min(1).default("sprout.ph"),
  NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type PublicEnv = z.infer<typeof publicSchema>;

/** Returns validated public env, or null when Supabase is not configured yet. */
export function getPublicEnv(): PublicEnv | null {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
    NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN:
      process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || undefined,
    NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN:
      process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN || undefined,
  });
  return parsed.success ? parsed.data : null;
}

export function isEmailDomainAllowed(email: string | undefined | null, domain: string) {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}
