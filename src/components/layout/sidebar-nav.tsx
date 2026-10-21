"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/components/layout/nav-config";

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.heading}>
          {collapsed ? (
            <div aria-hidden className="mx-2 mb-2 h-px bg-border" />
          ) : (
            <p className="eyebrow mb-1.5 px-3">{group.heading}</p>
          )}
          <ul className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? label : undefined}
                    title={collapsed ? label : undefined}
                    className={cn(
                      "group relative flex h-9 items-center gap-3 rounded-md text-sm font-medium transition-colors",
                      collapsed ? "justify-center px-0" : "px-3",
                      active ? "bg-accent-wash text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    {active && <span aria-hidden className="absolute -left-3 top-1.5 h-6 w-0.5 rounded-r bg-brand" />}
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
