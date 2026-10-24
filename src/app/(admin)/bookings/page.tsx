import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { LiveRefresh } from "@/components/layout/live-refresh";
import { BookingTable } from "@/components/vendors/bookings/booking-table";
import { AttendanceControls } from "@/components/vendors/bookings/attendance-controls";
import { listVendorsPage } from "@/server/actions/vendors.actions";
import { listVendorBookings } from "@/server/actions/bookings.actions";
import { listWorkspaceAttendance } from "@/server/actions/workspace.actions";
import { z } from "zod";

const LISTINGS_PER_PAGE = 5;
const ROWS_PER_LISTING = 20;

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const filter = z
    .enum(["all", "today", "upcoming", "completed", "cancelled"])
    .catch("all")
    .parse(params.status ?? "all");
  const vendors = await listVendorsPage({
    page: parsePage(params.page),
    pageSize: LISTINGS_PER_PAGE,
  });
  const groups = await Promise.all(
    vendors.items.map(async (vendor) => {
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: vendor.timeZone,
      });
      const rows = (await listVendorBookings(vendor.id)).filter(
        (row) =>
          filter === "all" ||
          (filter === "today"
            ? row.forDate === today
            : filter === "upcoming"
              ? row.forDate >= today &&
                ["PENDING", "CONFIRMED"].includes(row.status)
              : row.status === filter.toUpperCase()),
      );
      return { id: vendor.id, name: vendor.name, rows };
    }),
  );
  const visits = await listWorkspaceAttendance();
  return (
    <div className="space-y-6">
      <LiveRefresh />
      <PageHeader
        title="Bookings"
        description="Flex and single-visit reservations across your listings. Use Plans & Subscriptions for long-term memberships."
      />
      <AttendanceControls visits={visits} />
      <form className="flex gap-3">
        <select
          aria-label="Booking filter"
          name="status"
          defaultValue={filter}
          className="rounded border p-2"
        >
          {["all", "today", "upcoming", "completed", "cancelled"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
        <button className="rounded border px-4">Filter</button>
      </form>
      {groups.map((group) => (
        <section key={group.id} className="space-y-3">
          <h2 className="text-lg font-semibold">{group.name}</h2>
          <BookingTable bookings={group.rows.slice(0, ROWS_PER_LISTING)} />
          {group.rows.length > ROWS_PER_LISTING && (
            <Link
              href={`/vendors/${group.id}?tab=bookings`}
              className="text-sm text-primary underline"
            >
              Showing the latest {ROWS_PER_LISTING} of {group.rows.length}.
              View all bookings for {group.name}
            </Link>
          )}
        </section>
      ))}
      <ListPagination
        page={vendors}
        path="/bookings"
        params={params}
        noun="listings"
      />
    </div>
  );
}
