import Link from "next/link";

export type Crumb = { label: string; href?: string };

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  crumbs?: Crumb[];
}) {
  return (
    <div className="mb-6">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-1.5 text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            {crumbs.map((c, i) => (
              <li key={c.label} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden className="text-faint">/</span>}
                {c.href ? <Link href={c.href} className="hover:text-foreground hover:underline">{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function ComingSoon({ phase, children }: { phase: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
      <p className="text-sm font-medium">Not built yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>
      <p className="mt-3 text-xs text-muted">Planned for {phase}</p>
    </div>
  );
}
