"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, ChevronsLeft, ChevronsRight, Menu, Search, X } from "lucide-react";
import { Toaster } from "sonner";
import { ThemeToggle, useTheme } from "@/components/layout/theme-toggle";
import type { Theme } from "@/lib/theme";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { sectionFor } from "@/components/layout/nav-config";
import { cn } from "@/lib/utils";

const KEY = "sm.sidebar.collapsed";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const readCollapsed = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // storage unavailable: default expanded
  }
};

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/overview" className="flex h-14 items-center gap-2.5 border-b border-border px-4" aria-label="Subscription Monitoring, dashboard">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold tracking-tight text-primary-foreground">SM</span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">Subscription Monitoring</span>
          <span className="block truncate text-[11px] text-muted">Platform Operations</span>
        </span>
      )}
    </Link>
  );
}

export function AppShell({
  email,
  attentionCount,
  urgentCount,
  initialTheme,
  children,
}: {
  email: string;
  attentionCount: number;
  urgentCount: number;
  initialTheme: Theme;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [theme, setTheme] = useTheme(initialTheme);
  // Server renders expanded; the stored preference applies after hydration without a state-in-effect.
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  // The drawer is open only for the path it was opened on, so navigating closes it.
  const [drawerAt, setDrawerAt] = useState<string | null>(null);
  const drawer = drawerAt === pathname;
  const setDrawer = (open: boolean) => setDrawerAt(open ? pathname : null);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerAt(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const toggle = () => {
    try {
      localStorage.setItem(KEY, collapsed ? "0" : "1");
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  };

  const section = sectionFor(pathname);
  const initial = email.charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150 md:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <Brand collapsed={collapsed} />
        <SidebarNav collapsed={collapsed} />
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn("flex h-8 w-full items-center gap-2 rounded-md text-xs text-muted hover:bg-surface-2 hover:text-foreground", collapsed ? "justify-center" : "px-3")}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" aria-hidden />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4" aria-hidden /> Collapse
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface-solid shadow-md">
            <div className="flex items-center justify-between border-b border-border pr-2">
              <Brand />
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close navigation" className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <SidebarNav onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur md:px-8">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open navigation" className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 md:hidden">
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <div className="hidden min-w-0 text-sm md:block">
            {section ? (
              <p className="truncate">
                <span className="text-muted">{section.group}</span>
                <span aria-hidden className="mx-1.5 text-faint">/</span>
                <span className="font-medium">{section.label}</span>
              </p>
            ) : null}
          </div>

          <form action="/subscriptions" method="get" role="search" className="ml-auto hidden w-full max-w-xs sm:block">
            <label className="relative block">
              <span className="sr-only">Search subscriptions</span>
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-faint" aria-hidden />
              <input name="q" type="search" placeholder="Search subscriptions" className="h-9 w-full rounded-md border border-border bg-surface-2 pl-8 pr-3 text-sm placeholder:text-faint" />
            </label>
          </form>

          <Link
            href="/alerts"
            className="relative ml-auto flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground sm:ml-0"
            aria-label={attentionCount > 0 ? `${attentionCount} items need attention${urgentCount ? `, ${urgentCount} urgent` : ""}` : "No items need attention"}
          >
            <Bell className="h-[18px] w-[18px]" aria-hidden />
            {attentionCount > 0 && (
              <span className={cn("num absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold", urgentCount > 0 ? "bg-danger-solid text-white" : "bg-primary text-primary-foreground")}>
                {attentionCount > 99 ? "99+" : attentionCount}
              </span>
            )}
          </Link>

          <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md px-1.5 hover:bg-surface-2 [&::-webkit-details-marker]:hidden" aria-label="Account menu">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-wash text-xs font-semibold text-accent">{initial}</span>
            </summary>
            <div className="absolute right-0 mt-1 w-64 rounded-md border border-border bg-surface-solid p-1 shadow-md">
              <p className="truncate px-3 py-2 text-xs text-muted">{email}</p>
              <div className="px-3 pb-2">
                <p className="eyebrow mb-1.5">Theme</p>
                <ThemeToggle value={theme} onChange={setTheme} className="w-full justify-between" />
              </div>
              <div aria-hidden className="my-1 h-px bg-border" />
              <Link href="/settings" className="block rounded px-3 py-1.5 text-sm hover:bg-surface-2">
                Settings
              </Link>
              <form action="/auth/signout" method="post">
                <button className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-surface-2">Sign out</button>
              </form>
            </div>
          </details>
        </header>

        <div className="relative flex-1">
          <div aria-hidden className="aura" />
          <main id="main" className="relative z-10 mx-auto w-full max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
        <Toaster richColors closeButton position="top-right" theme={theme} />
      </div>
    </div>
  );
}
