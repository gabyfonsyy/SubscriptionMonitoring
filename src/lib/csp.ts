/**
 * Content-Security-Policy, built per request so scripts carry a fresh nonce.
 *
 * - Scripts: only 'self' plus nonce-tagged ones ('strict-dynamic' lets Next.js chunks load from those).
 * - Styles: 'unsafe-inline' is required because Recharts and Next set inline style attributes. Style
 *   injection cannot execute script, so this is the usual, accepted trade-off.
 * - connect-src: Supabase (REST + realtime websocket). Everything else is blocked.
 * - Dev needs 'unsafe-eval' (React refresh) and the HMR websocket; never added in production.
 */
export function buildCsp(opts: { nonce: string; supabaseUrl?: string; dev?: boolean }): string {
  const supabase = opts.supabaseUrl ? new URL(opts.supabaseUrl) : null;
  const connect = ["'self'"];
  if (supabase) connect.push(supabase.origin, `wss://${supabase.host}`);
  if (opts.dev) connect.push("ws://localhost:*", "http://localhost:*");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${opts.nonce}'`, "'strict-dynamic'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": connect,
    "form-action": ["'self'", ...(supabase ? [supabase.origin] : []), "https://accounts.google.com"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ")
    .concat(opts.dev ? "" : "; upgrade-insecure-requests");
}

export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
