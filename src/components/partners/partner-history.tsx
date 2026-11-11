import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePartnerAccess } from "@/lib/rbac";
import { pageWindow, toPage, parsePage } from "@/lib/pagination";
import { ListPagination } from "@/components/layout/list-pagination";
export async function PartnerHistory({
  partnerId,
  searchParams,
}: {
  partnerId: string;
  searchParams: Record<string, string | undefined>;
}) {
  await requirePartnerAccess(partnerId, "auditLog.read");
  const window = pageWindow(parsePage(searchParams.page));
  const where = { partnerId };
  const [rows, count] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: window.skip,
      take: window.take,
      include: { user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Partner activity</h2>
      <p className="text-sm text-muted-foreground">
        Attributed actions for this organization. Older unattributed actions
        remain in the{" "}
        <Link className="underline" href="/audit-logs">
          platform audit log
        </Link>
        .
      </p>
      <ul className="divide-y rounded-lg border">
        {rows.map((r) => (
          <li key={r.id} className="space-y-1 p-4 text-sm">
            <p className="font-medium">{r.action.replaceAll("_", " ")}</p>
            <p>
              {r.user?.name ?? "System"} · {r.createdAt.toLocaleString("en-IN")}
            </p>
            <p className="text-muted-foreground">
              {r.entityType} · {r.entityId}
            </p>
          </li>
        ))}
      </ul>
      {!count && <p>No attributed activity yet.</p>}
      <ListPagination
        page={toPage(rows, count, window)}
        path={`/partners/${partnerId}/history`}
        params={searchParams}
      />
    </div>
  );
}
