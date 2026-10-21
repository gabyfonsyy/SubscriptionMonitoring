import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FlashToast } from "@/components/ui/flash-toast";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env";
import { listAllInventory } from "@/data/portfolio";
import { buildAttentionQueue } from "@/domain/attention";
import { todayISO } from "@/lib/date";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

// Per-user, session-dependent: never prerender.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!getPublicEnv()) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  // Header bell. The inventory query is request-cached, so pages that need it reuse this result.
  const queue = buildAttentionQueue(await listAllInventory(), todayISO());
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <AppShell
      email={data.user.email ?? ""}
      attentionCount={queue.length}
      urgentCount={queue.filter((i) => i.severity === "high").length}
      initialTheme={theme}
    >
      {children}
      <Suspense>
        <FlashToast />
      </Suspense>
    </AppShell>
  );
}
