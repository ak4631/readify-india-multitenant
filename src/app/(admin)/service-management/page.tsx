import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { listVendorsPage } from "@/server/actions/vendors.actions";
import { getLibraryOccupancy } from "@/server/actions/library-occupancy.actions";
import { LibraryOccupancyPanel } from "@/components/vendors/library/occupancy-panel";
import { LiveRefresh } from "@/components/layout/live-refresh";

export default async function ServiceManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { date } = params;
  const vendors = await listVendorsPage({
    categorySlug: "library",
    page: parsePage(params.page),
    pageSize: 5,
  });
  return (
    <div className="space-y-8">
      <LiveRefresh />
      <PageHeader
        title="Service Management"
        description="Seat-by-time availability from the same reservation ledger used by customer checkout."
      />
      <form className="flex gap-3">
        <input
          aria-label="Occupancy date"
          name="date"
          type="date"
          defaultValue={date}
          className="rounded border p-2"
        />
        <button className="rounded border px-4">View date</button>
      </form>
      {await Promise.all(
        vendors.items.map(async (vendor) => (
          <section key={vendor.id} className="space-y-4">
            <h2 className="text-xl font-semibold">{vendor.name}</h2>
            <Link
              href={`/vendors/${vendor.id}?tab=category`}
              className="text-primary underline"
            >
              Configure seats and operating hours
            </Link>
            <LibraryOccupancyPanel
              data={await getLibraryOccupancy(
                vendor.id,
                date && /^\d{4}-\d{2}-\d{2}$/.test(date)
                  ? date
                  : new Date().toLocaleDateString("en-CA", {
                      timeZone: vendor.timeZone,
                    }),
              )}
            />
          </section>
        )),
      )}
      {!vendors.total && <p>No Library listings yet.</p>}
      <ListPagination
        page={vendors}
        path="/service-management"
        params={params}
        noun="listings"
      />
    </div>
  );
}
