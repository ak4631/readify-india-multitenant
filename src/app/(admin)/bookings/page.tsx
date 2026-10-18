import { PageHeader } from "@/components/layout/page-header";
import { LiveRefresh } from "@/components/layout/live-refresh";
import { BookingTable } from "@/components/vendors/bookings/booking-table";
import { AttendanceControls } from "@/components/vendors/bookings/attendance-controls";
import { listVendors } from "@/server/actions/vendors.actions";
import { listVendorBookings } from "@/server/actions/bookings.actions";
import { listWorkspaceAttendance } from "@/server/actions/workspace.actions";
import { z } from "zod";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = z
    .enum(["all", "today", "upcoming", "completed", "cancelled"])
    .catch("all")
    .parse(status ?? "all");
  const vendors = await listVendors();
  const groups = await Promise.all(
    vendors.map(async (vendor) => ({
      id: vendor.id,
      name: vendor.name,
      today: new Date().toLocaleDateString("en-CA", {
        timeZone: vendor.timeZone,
      }),
      rows: await listVendorBookings(vendor.id),
    })),
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
          <BookingTable
            bookings={group.rows.filter(
              (row) =>
                filter === "all" ||
                (filter === "today"
                  ? row.forDate === group.today
                  : filter === "upcoming"
                    ? row.forDate >= group.today &&
                      ["PENDING", "CONFIRMED"].includes(row.status)
                    : row.status === filter.toUpperCase()),
            )}
          />
        </section>
      ))}
    </div>
  );
}
