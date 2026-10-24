import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Page } from "@/lib/pagination";

type SearchParams = Record<string, string | string[] | undefined>;

function hrefFor(path: string, params: SearchParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value])
      if (entry !== "") query.append(key, entry);
  }
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

// Page numbers around the current one, with gaps marked as null.
function visiblePages(page: number, pageCount: number) {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
  const result: (number | null)[] = [];
  sorted.forEach((value, index) => {
    if (index && value - sorted[index - 1] > 1) result.push(null);
    result.push(value);
  });
  return result;
}

export function ListPagination({
  page,
  path,
  params = {},
  noun = "results",
}: {
  page: Pick<Page<unknown>, "page" | "pageCount" | "pageSize" | "total">;
  path: string;
  params?: SearchParams;
  noun?: string;
}) {
  if (!page.total) return null;
  const first = (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.page * page.pageSize, page.total);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm"
    >
      <p className="text-muted-foreground">
        {first > page.total
          ? `No ${noun} on this page`
          : `Showing ${first}–${last} of ${page.total} ${noun}`}
      </p>
      {page.pageCount > 1 && (
        <div className="flex items-center gap-1">
          <PageLink
            href={hrefFor(path, params, page.page - 1)}
            disabled={page.page <= 1}
            label="Previous page"
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Previous</span>
          </PageLink>
          {visiblePages(page.page, page.pageCount).map((value, index) =>
            value === null ? (
              <span
                key={`gap-${index}`}
                className="px-2 text-muted-foreground"
                aria-hidden
              >
                …
              </span>
            ) : (
              <PageLink
                key={value}
                href={hrefFor(path, params, value)}
                active={value === page.page}
                label={`Page ${value}`}
              >
                {value}
              </PageLink>
            ),
          )}
          <PageLink
            href={hrefFor(path, params, page.page + 1)}
            disabled={page.page >= page.pageCount}
            label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="size-4" />
          </PageLink>
        </div>
      )}
    </nav>
  );
}

function PageLink({
  href,
  active,
  disabled,
  label,
  children,
}: {
  href: string;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled)
    return (
      <Button variant="ghost" size="sm" disabled aria-label={label}>
        {children}
      </Button>
    );
  return (
    <Button
      variant={active ? "outline" : "ghost"}
      size="sm"
      nativeButton={false}
      render={
        <Link
          href={href}
          aria-label={label}
          aria-current={active ? "page" : undefined}
        >
          {children}
        </Link>
      }
    />
  );
}
