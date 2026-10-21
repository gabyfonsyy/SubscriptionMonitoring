export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function ComingSoon({ phase, children }: { phase: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
      <p className="text-sm font-medium">Not built yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>
      <p className="mt-3 text-xs text-muted">Planned for {phase}</p>
    </div>
  );
}
