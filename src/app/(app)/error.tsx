"use client";

import { buttonCls } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-wash p-6">
      <p className="text-sm font-semibold">Something went wrong</p>
      <p className="mt-1 text-sm text-muted">{error.message || "An unexpected error occurred."}</p>
      {error.digest && <p className="num mt-1 text-xs text-faint">Reference: {error.digest}</p>}
      <button onClick={reset} className={`mt-3 ${buttonCls("secondary")}`}>
        Try again
      </button>
    </div>
  );
}
