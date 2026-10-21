import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { buildCsp, newNonce } from "@/lib/csp";

export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV !== "production",
  });
  // Escape hatch if a policy ever blocks something legitimate: CSP_REPORT_ONLY=true logs
  // violations in the browser console instead of blocking them.
  const header = process.env.CSP_REPORT_ONLY === "true" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

  // Next.js reads the nonce from the request's CSP header and applies it to its own scripts.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set(header, csp);

  const response = await updateSession(new NextRequest(request, { headers }));
  response.headers.set(header, csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
