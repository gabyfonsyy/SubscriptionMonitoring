export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-border" />
      <div className="h-28 animate-pulse rounded-xl bg-border/60" />
      <div className="h-80 animate-pulse rounded-xl bg-border/60" />
      <span className="sr-only">Loading subscriptions…</span>
    </div>
  );
}
