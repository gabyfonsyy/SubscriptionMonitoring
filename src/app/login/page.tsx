import { getPublicEnv } from "@/lib/env";
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground">
            SM
          </div>
          <h1 className="text-lg font-semibold">Subscription Monitoring</h1>
          <p className="text-sm text-muted">Platform Operations</p>
        </div>

        {!env && (
          <p role="alert" className="mb-4 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
            Supabase is not configured. Copy <code>.env.example</code> to{" "}
            <code>.env.local</code>, fill in the values, and restart the dev server.
          </p>
        )}
        {error && ERRORS[error] && (
          <p role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
            {ERRORS[error]}
          </p>
        )}

        <LoginForm
          disabled={!env}
          domain={env?.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? ""}
          passwordLogin={env?.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN ?? false}
        />
      </div>
    </main>
  );
}
