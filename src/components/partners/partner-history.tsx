import Link from "next/link";
import { getPartnerHistory } from "@/server/actions/page-data.actions";
import { toPage, parsePage } from "@/lib/pagination";
import { ListPagination } from "@/components/layout/list-pagination";
export async function PartnerHistory({
  partnerId,
  searchParams,
}: {
  partnerId: string;
  searchParams: Record<string, string | undefined>;
}) {
  const { rows, count, window } = await getPartnerHistory(
    partnerId,
    parsePage(searchParams.page),
  );
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
