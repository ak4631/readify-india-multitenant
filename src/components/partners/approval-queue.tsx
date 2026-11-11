import Link from "next/link";
import { listApprovalQueue } from "@/server/actions/approval-queue.actions";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";

export async function ApprovalQueue({
  partnerId,
  searchParams = {},
}: {
  partnerId?: string;
  searchParams?: Record<string, string | undefined>;
}) {
  const result = await listApprovalQueue({
    partnerId,
    kind: searchParams.kind,
    page: parsePage(searchParams.page),
  });
  const base = partnerId ? `/partners/${partnerId}/approvals` : "/approvals";
  const types = [
    ["applications", "Partner applications"],
    ["listings", "Listings & publication"],
    ["changes", "Listing revisions"],
    ["documents", "Documents"],
    ["issues", "Rejected & suspended"],
    ["support", "Open support"],
    ["refunds", "Pending refunds"],
  ];
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Approvals and actions</h2>
      <nav aria-label="Action types" className="flex flex-wrap gap-2">
        {types.map(([key, label]) => (
          <Link
            key={key}
            href={`${base}?kind=${key}`}
            aria-current={result.kind === key ? "page" : undefined}
            className={`rounded border px-3 py-2 text-sm ${result.kind === key ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">
        {result.total} items · oldest first. Open an item to review its exact
        submitted content or resolve the issue.
      </p>
      <ul className="divide-y rounded-lg border">
        {result.items.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0">
              <Link
                className="font-semibold text-primary underline"
                href={row.href}
              >
                {row.title}
              </Link>
              <p className="break-words text-sm text-muted-foreground">
                {row.detail}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.createdAt.toLocaleString("en-IN")}
              </p>
            </div>
            <span className="rounded border px-2 py-1 text-xs">
              {row.status}
            </span>
          </li>
        ))}
      </ul>
      {!result.total && (
        <p className="rounded-lg border p-5">
          No items require action in this category.
        </p>
      )}
      <ListPagination page={result} path={base} params={searchParams} />
    </div>
  );
}
