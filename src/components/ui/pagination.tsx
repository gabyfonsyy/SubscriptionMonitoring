import Link from "next/link";

export function Pagination({
  page,
  pageSize,
  total,
  params,
  basePath,
}: {
  page: number;
  pageSize: number;
  total: number;
  params: Record<string, string | undefined>;
  basePath: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const linkCls = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background";
  const disabledCls = "rounded-md border border-border px-3 py-1.5 text-sm opacity-50";

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-4 text-sm">
      <p className="text-muted">
        {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkCls}>
            Previous
          </Link>
        ) : (
          <span className={disabledCls} aria-disabled>
            Previous
          </span>
        )}
        <span className="px-1 py-1.5 text-muted">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={linkCls}>
            Next
          </Link>
        ) : (
          <span className={disabledCls} aria-disabled>
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
