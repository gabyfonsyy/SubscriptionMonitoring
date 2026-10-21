import { Skeleton } from "@/components/ui/panel";

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-20 rounded-lg" />
      <div className="rounded-lg border border-border bg-surface shadow-sm">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="ml-auto h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading subscriptions…</span>
    </div>
  );
}
