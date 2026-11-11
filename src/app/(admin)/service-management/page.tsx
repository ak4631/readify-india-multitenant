import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { partnerPath } from "@/lib/partner-path";
import { listVendorsPage } from "@/server/actions/vendors.actions";
import { getLibraryOccupancy } from "@/server/actions/library-occupancy.actions";
import { LibraryOccupancyPanel } from "@/components/vendors/library/occupancy-panel";
export default async function ServiceManagement({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string; date?: string; page?: string }>;
}) {
  const params = await searchParams;
  const vendors = await listVendorsPage({
    partnerId: params.partnerId,
    page: parsePage(params.page),
    pageSize: 5,
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Service management"
        description="Manage each listing using its service-specific tools. Library availability uses the same reservation ledger as customer checkout."
      />
      <form className="flex flex-wrap gap-3">
        <input
          aria-label="Occupancy date"
          name="date"
          type="date"
          defaultValue={params.date}
          className="rounded border p-2"
        />
        <button className="rounded border px-4 py-2">View date</button>
      </form>
      {await Promise.all(
        vendors.items.map(async (v) => (
          <section key={v.id} className="space-y-4 rounded-lg border p-4">
            <div>
              <h2 className="text-xl font-semibold">{v.name}</h2>
              <p className="text-sm text-muted-foreground">
                {v.category.name} · {v.status}
              </p>
            </div>
            <Link
              href={`/vendors/${v.id}?tab=category`}
              className="text-primary underline"
            >
              Configure{" "}
              {v.category.slug === "library"
                ? "seats"
                : v.category.slug === "gym"
                  ? "trainers and capacity"
                  : v.category.slug === "exam-hub"
                    ? "academics and capacity"
                    : "menu and capacity"}
            </Link>
            {v.category.slug === "library" ? (
              <LibraryOccupancyPanel
                data={await getLibraryOccupancy(
                  v.id,
                  params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
                    ? params.date
                    : new Date().toLocaleDateString("en-CA", {
                        timeZone: v.timeZone,
                      }),
                )}
              />
            ) : (
              <p className="text-sm">
                Configured capacity: {v.capacity ?? "Not set"}. Publication
                remains subject to service availability and Super Admin
                approval.
              </p>
            )}
          </section>
        )),
      )}
      {!vendors.total && <p>No service listings yet.</p>}
      <ListPagination
        page={vendors}
        path={partnerPath(params.partnerId, "service-management")}
        params={params}
        noun="listings"
      />
    </div>
  );
}
