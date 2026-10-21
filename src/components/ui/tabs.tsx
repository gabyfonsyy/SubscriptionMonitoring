import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabItem = { key: string; label: string; href: string; count?: number };

/** Server-rendered tabs: each tab is a link, so the URL is shareable and the back button works. */
export function LinkTabs({ tabs, active, label }: { tabs: TabItem[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              on ? "border-brand text-foreground" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={cn("num rounded-full px-1.5 text-xs", on ? "bg-accent-wash text-accent" : "bg-surface-2 text-muted")}>{t.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
