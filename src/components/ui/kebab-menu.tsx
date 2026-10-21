import Link from "next/link";

export type MenuItem = { label: string; href: string };

/** Row actions without a client bundle: a <details> popover. Closes when focus leaves. */
export function KebabMenu({ label, items }: { label: string; items: MenuItem[] }) {
  return (
    <details className="group relative inline-block text-left">
      <summary
        aria-label={label}
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground [&::-webkit-details-marker]:hidden"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="8" cy="3" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13" r="1.4" />
        </svg>
      </summary>
      <ul className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-border bg-surface-solid py-1 text-sm shadow-md">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="block px-3 py-1.5 hover:bg-surface-2">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
