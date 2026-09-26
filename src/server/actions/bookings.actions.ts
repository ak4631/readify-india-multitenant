"use server";

import { prisma } from "@/lib/prisma";
import { lookupCustomerProfiles } from "@/lib/profiles";
import { requireVendorAccess } from "@/lib/rbac";

// A booking ("order") as the partner sees it: who placed it, when, for which
// seat and which time slot.
export type VendorBookingRow = {
  id: string;
  bookingCode: string | null;
  customerName: string;
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

export async function listVendorBookings(
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

  const bookings = await prisma.booking.findMany({
    where: { vendorId },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    include: {
      plan: { select: { name: true } },
      seat: { select: { label: true } },
    },
  });
  const profiles = await lookupCustomerProfiles(bookings.map((b) => b.userId));

  return bookings.map((b) => {
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
  });
}
