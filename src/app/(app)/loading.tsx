import { Skeleton } from "@/components/ui/panel";

/** Shown while any page in the app shell loads: a title, a row of metric tiles and a content block. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-lg" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
