import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { FlashToast } from "@/components/ui/flash-toast";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env";
import { SidebarNav } from "@/components/layout/sidebar-nav";

// Per-user, session-dependent: never prerender.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!getPublicEnv()) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-xs font-semibold text-accent-foreground">
            SM
          </div>
          <span className="text-sm font-semibold">Subscription Monitoring</span>
        </div>
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4 md:px-8">
          <span className="text-sm text-muted md:hidden">Subscription Monitoring</span>
          <span className="hidden md:block" />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">{data.user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
        <Toaster richColors closeButton position="top-right" />
        <Suspense>
          <FlashToast />
        </Suspense>
      </div>
    </div>
  );
}
