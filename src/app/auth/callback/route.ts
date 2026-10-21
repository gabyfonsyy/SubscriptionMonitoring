import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv, isEmailDomainAllowed } from "@/lib/env";

export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const env = getPublicEnv();

  if (!code || !env) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // Server-side domain enforcement (the `hd` hint on the client is not a control).
  if (!isEmailDomainAllowed(data.user.email, env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=domain`);
  }

  return NextResponse.redirect(`${origin}/overview`);
}
