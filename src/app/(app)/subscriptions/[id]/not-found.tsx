import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-xl border border-border bg-surface p-10 text-center">
      <p className="text-sm font-medium">Subscription not found</p>
      <p className="mt-1 text-sm text-muted">It may have been removed or you may not have access.</p>
      <Link href="/subscriptions" className="mt-3 inline-block text-sm text-accent underline">
        Back to subscriptions
      </Link>
    </div>
  );
}
