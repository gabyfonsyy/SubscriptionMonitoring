"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-6">
      <p className="text-sm font-medium">Something went wrong</p>
      <p className="mt-1 text-sm text-muted">{error.message || "An unexpected error occurred."}</p>
      <button onClick={reset} className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background">
        Try again
      </button>
    </div>
  );
}
