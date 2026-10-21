import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth"];
// Cron authenticates with its own bearer secret, not a user session.
const SELF_AUTHENTICATED_PATHS = ["/api/cron"];

/** Refreshes the Supabase session cookie and gates unauthenticated access. */
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;

  if (SELF_AUTHENTICATED_PATHS.some((p) => path.startsWith(p))) {
    return NextResponse.next({ request });
  }

  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  // Not configured yet: only the login page (which explains the problem) is reachable.
  if (!url || !key) {
    if (isPublic) return NextResponse.next({ request });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  if (!data.user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (data.user && path === "/login") {
    return NextResponse.redirect(new URL("/overview", request.url));
  }
  return response;
}
