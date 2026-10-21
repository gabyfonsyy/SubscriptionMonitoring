import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";
import { ThemeSwitch } from "@/components/layout/theme-toggle";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { LoginForm } from "./login-form";

const ERRORS: Record<string, string> = {
  auth: "Sign-in could not be completed. Please try again.",
  domain: "That Google account is not on the allowed company domain.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const env = getPublicEnv();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Soft colour bloom so the card has something to sit on; decorative only. */}
      <div aria-hidden className="aura" />
      <div className="absolute right-4 top-4 z-10">
        <ThemeSwitch initial={theme} />
      </div>

      <div className="relative w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-sm font-bold tracking-tight text-primary-foreground">SM</div>
          <div>
            <h1 className="text-base font-semibold leading-tight tracking-tight">Subscription Monitoring</h1>
            <p className="text-xs text-muted">Platform Operations</p>
          </div>
        </div>

        {!env && (
          <p role="alert" className="mb-4 rounded-md border border-warn/30 bg-warn-wash p-3 text-sm">
            Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code>, fill in the values, and restart the dev server.
          </p>
        )}
        {error && ERRORS[error] && (
          <p role="alert" className="mb-4 rounded-md border border-danger/30 bg-danger-wash p-3 text-sm">
            {ERRORS[error]}
          </p>
        )}

        <LoginForm
          disabled={!env}
          domain={env?.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? ""}
          passwordLogin={env?.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN ?? false}
        />
        <p className="mt-6 text-center text-xs text-faint">Access is limited to company accounts.</p>
      </div>
    </main>
  );
}
