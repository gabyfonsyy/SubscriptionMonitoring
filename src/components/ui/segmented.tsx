import Link from "next/link";
import { cn } from "@/lib/utils";

export type SegmentOption = { key: string; label: string; href: string };

/** A compact link group for choosing one value (period, currency, grouping). State lives in the URL. */
export function Segmented({ options, active, label }: { options: SegmentOption[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-md border border-border-strong bg-surface p-0.5 shadow-sm">
      {options.map((o) => {
        const on = o.key === active;
        return (
          <Link
            key={o.key}
            href={o.href}
            aria-current={on ? "true" : undefined}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              on ? "bg-accent-wash text-accent" : "text-muted hover:text-foreground",
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
