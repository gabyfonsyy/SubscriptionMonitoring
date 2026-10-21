"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({
  disabled,
  domain,
  passwordLogin,
}: {
  disabled: boolean;
  domain: string;
  passwordLogin: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function google() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: domain },
      },
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    router.replace("/overview");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={google}
        disabled={disabled || busy}
        className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        Sign in with Google{domain ? ` (@${domain})` : ""}
      </button>

      {passwordLogin && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" /> development only <span className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={withPassword} className="space-y-3">
            <label className="block text-sm">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={disabled || busy}
              className="w-full rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-background disabled:opacity-50"
            >
              Sign in with email
            </button>
          </form>
        </>
      )}

      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
