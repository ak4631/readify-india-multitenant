import { partnerPath } from "@/lib/partner-path";
import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { RecordFilters } from "@/components/layout/record-filters";
import { parsePage } from "@/lib/pagination";
import { LiveRefresh } from "@/components/layout/live-refresh";
import { BookingTable } from "@/components/vendors/bookings/booking-table";
import { AttendanceControls } from "@/components/vendors/bookings/attendance-controls";
import {
  listWorkspaceBookings,
  listBookingListingOptions,
} from "@/server/actions/bookings.actions";
import { listWorkspaceAttendance } from "@/server/actions/workspace.actions";
import { z } from "zod";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    partnerId?: string;
    vendorId?: string;
    q?: string;
    date?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const status = z
    .enum([
      "all",
      "today",
      "upcoming",
      "pending",
      "confirmed",
      "completed",
      "cancelled",
      "expired",
    ])
    .catch("all")
    .parse(params.status ?? "all");
  const date = z.iso.date().safeParse(params.date);
  const filters = {
    ...params,
    status,
    date: date.success ? date.data : undefined,
  };
  const [bookings, listings, visits] = await Promise.all([
    listWorkspaceBookings({ ...filters, page: parsePage(params.page) }),
    listBookingListingOptions(params.partnerId),
    listWorkspaceAttendance(params.partnerId),
  ]);
  const path = partnerPath(params.partnerId, "bookings");
  return (
    <div className="min-w-0 space-y-6">
      <LiveRefresh />
      <PageHeader
        title="Bookings"
        description="Flex and single-visit reservations across your listings. Search and filter all bookings in one place."
      />
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Check-in / check-out · {visits.length} checked in now
        </summary>
        <div className="mt-4">
          <AttendanceControls visits={visits} />
        </div>
      </details>
      <RecordFilters
        path={path}
        params={filters}
        listings={listings}
        searchPlaceholder="Customer, booking ID or listing…"
        dateLabel="Booked for"
        statuses={[
          { value: "all", label: "All statuses" },
          { value: "today", label: "Today" },
          { value: "upcoming", label: "Upcoming" },
          ...["pending", "confirmed", "completed", "cancelled", "expired"].map(
            (value) => ({
              value,
              label: value.charAt(0).toUpperCase() + value.slice(1),
            }),
          ),
        ]}
      />
      <section
        aria-label="Bookings"
        className="min-w-0 rounded-xl border bg-card p-4"
      >
        <BookingTable bookings={bookings.items} showListing />
        <ListPagination
          page={bookings}
          path={path}
          params={filters}
          noun="bookings"
        />
      </section>
    </div>
  );
}
