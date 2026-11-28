"use server";

import {
  lookupBookingCustomerSnapshots,
  type BookingCustomerSnapshot,
} from "@/lib/booking-customer-snapshots";
import { prisma } from "@/lib/prisma";
import { lookupCustomerProfiles } from "@/lib/profiles";
import { Prisma } from "@/generated/prisma/client";
import { pageWindow, toPage } from "@/lib/pagination";
import { bookingListQuery } from "@/lib/booking-list-query";
import {
  requirePermission,
  getAccessibleVendorIds,
  requireVendorAccess,
} from "@/lib/rbac";

// A booking ("order") as the partner sees it: who placed it, when, for which
// seat and which time slot.
export type VendorBookingRow = {
  id: string;
  vendorId?: string;
  vendorName?: string;
  bookingCode: string | null;
  customerName: string;
  customerDetails?: BookingCustomerSnapshot;
  customerEmail: string | null;
  placedOn: string; // ISO timestamp
  forDate: string; // YYYY-MM-DD
  seatLabel: string | null;
  slotLabel: string; // "06:00 – 12:00", or the legacy bucket label
  hours: number | null;
  planName: string;
  amount: number;
  status: string;
};

const MAX_ROWS = 200;

async function local_listVendorBookings(
  vendorId: string,
): Promise<VendorBookingRow[]> {
  await requireVendorAccess(vendorId, "vendor.read");

  const vendor = await prisma.vendor.findUniqueOrThrow({
    where: { id: vendorId },
    select: { timeZone: true },
  });
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: vendor.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [bookings, flexBookings] = await Promise.all([
    prisma.booking.findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
      select: {
        id: true,
        userId: true,
        bookingCode: true,
        createdAt: true,
        bookingDate: true,
        startAt: true,
        endAt: true,
        timeLabel: true,
        durationHours: true,
        seatLabel: true,
        amount: true,
        status: true,
        plan: { select: { name: true } },
        seat: { select: { label: true } },
      },
    }),
    prisma.flexBooking.findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
      select: {
        id: true,
        userId: true,
        bookingCode: true,
        createdAt: true,
        startDate: true,
        seatId: true,
        slotStart: true,
        slotHours: true,
        days: true,
        amount: true,
        status: true,
      },
    }),
  ]);
  const profiles = await lookupCustomerProfiles(
    [...bookings, ...flexBookings].map((b) => b.userId),
  );
  const seatIds = [...new Set(flexBookings.map((b) => b.seatId))];
  const seats = seatIds.length
    ? await prisma.librarySeat.findMany({
        where: { id: { in: seatIds } },
        select: { id: true, label: true },
      })
    : [];
  const seatLabels = new Map(seats.map((seat) => [seat.id, seat.label]));
  const flexRows: VendorBookingRow[] = flexBookings.map((b) => ({
    id: b.id,
    bookingCode: b.bookingCode,
    customerName: profiles.get(b.userId)?.fullName ?? "Customer",
    customerEmail: profiles.get(b.userId)?.email ?? null,
    placedOn: b.createdAt.toISOString(),
    forDate: b.startDate.toISOString().slice(0, 10),
    seatLabel: seatLabels.get(b.seatId) ?? null,
    slotLabel: `${b.slotStart.toISOString().slice(11, 16)} · ${b.slotHours}h/day · ${b.days} days`,
    hours: b.slotHours * b.days,
    planName: "Flex Booking",
    amount: Number(b.amount),
    status: b.status,
  }));
  const snapshots = await lookupBookingCustomerSnapshots(
    [...bookings, ...flexBookings].map((b) => b.id),
  );
  return [
    ...flexRows,
    ...bookings.map((b) => {
      const profile = profiles.get(b.userId);
      return {
        id: b.id,
        bookingCode: b.bookingCode,
        customerName: profile?.fullName ?? "Customer",
        customerEmail: profile?.email ?? null,
        placedOn: b.createdAt.toISOString(),
        // booking_date is a zone-less timestamp holding the chosen calendar day.
        forDate: b.bookingDate.toISOString().slice(0, 10),
        seatLabel: b.seat?.label ?? null,
        slotLabel:
          b.startAt && b.endAt
            ? `${fmt.format(b.startAt)} – ${fmt.format(b.endAt)}`
            : (b.timeLabel ?? "—"),
        hours: b.durationHours ? Number(b.durationHours) : null,
        planName: b.plan?.name ?? b.seatLabel ?? "—",
        amount: Number(b.amount),
        status: b.status,
      };
    }),
  ]
    .map((row) => ({
      ...row,
      customerName: snapshots.get(row.id)?.fullName ?? row.customerName,
      customerDetails: snapshots.get(row.id),
    }))
    .sort((a, b) => b.placedOn.localeCompare(a.placedOn))
    .slice(0, MAX_ROWS);
}

async function local_listWorkspaceBookings(
  filters: import("@/lib/booking-list-query").BookingListFilters = {},
) {
  const session = await requirePermission("vendor.read");
  const ids = await getAccessibleVendorIds(session, filters.partnerId);
  const window = pageWindow(filters.page ?? 1);
  const query = bookingListQuery(ids, filters);
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        id: string;
        vendor_id: string;
        vendor_name: string;
        booking_code: string | null;
        customer_name: string;
        customer_email: string | null;
        created_at: Date;
        for_date: Date;
        seat_label: string | null;
        slot_label: string;
        plan_name: string;
        hours: unknown;
        amount: unknown;
        status: string;
      }>
    >(
      Prisma.sql`${query} SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT ${window.take} OFFSET ${window.skip}`,
    ),
    prisma.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`${query} SELECT count(*) AS total FROM filtered`,
    ),
  ]);
  const snapshots = await lookupBookingCustomerSnapshots(rows.map((r) => r.id));
  return toPage(
    rows.map((r) => ({
      id: r.id,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      bookingCode: r.booking_code,
      customerName: snapshots.get(r.id)?.fullName ?? r.customer_name,
      customerDetails: snapshots.get(r.id),
      customerEmail: r.customer_email,
      placedOn: r.created_at.toISOString(),
      forDate: r.for_date.toISOString().slice(0, 10),
      seatLabel: r.seat_label,
      slotLabel: r.slot_label,
      planName: r.plan_name,
      hours: r.hours == null ? null : Number(r.hours),
      amount: Number(r.amount),
      status: r.status,
    })),
    Number(count[0]?.total ?? 0),
    window,
  );
}

async function local_listBookingListingOptions(partnerId?: string) {
  const session = await requirePermission("vendor.read");
  const ids = await getAccessibleVendorIds(session, partnerId);
  return prisma.vendor.findMany({
    where: ids ? { id: { in: ids } } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listVendorBookings(
  ...args: Parameters<typeof local_listVendorBookings>
): Promise<Awaited<ReturnType<typeof local_listVendorBookings>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listVendorBookings>>>(
      "bookings.actions.listVendorBookings",
      args,
    );
  }
  return local_listVendorBookings(...args);
}

export async function listWorkspaceBookings(
  ...args: Parameters<typeof local_listWorkspaceBookings>
): Promise<Awaited<ReturnType<typeof local_listWorkspaceBookings>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listWorkspaceBookings>>>(
      "bookings.actions.listWorkspaceBookings",
      args,
    );
  }
  return local_listWorkspaceBookings(...args);
}

export async function listBookingListingOptions(
  ...args: Parameters<typeof local_listBookingListingOptions>
): Promise<Awaited<ReturnType<typeof local_listBookingListingOptions>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_listBookingListingOptions>>
    >("bookings.actions.listBookingListingOptions", args);
  }
  return local_listBookingListingOptions(...args);
}
