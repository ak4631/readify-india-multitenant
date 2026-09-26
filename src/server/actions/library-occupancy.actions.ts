"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { lookupCustomerProfiles } from "@/lib/profiles";
import { requireVendorAccess } from "@/lib/rbac";

// Seat + time occupancy for one library on one day. All availability comes
// from the same SQL helpers the customer app uses (admin.vendor_open_window /
// admin.seat_busy_intervals, migration 20260926100000_library_seat_hours_
// availability), so the partner view and the booking path can't disagree.

export type OccupancyInterval = {
  source: "booking" | "subscription";
  refId: string;
  startLabel: string;
  endLabel: string;
  // Position on the day's opening window (0-100) for the timeline bar.
  startPct: number;
  endPct: number;
  hours: number;
  customerName: string;
  customerEmail: string | null;
  planName: string;
  status: string;
  revenue: number;
  bookingCode: string | null;
};

export type SeatOccupancy = {
  seatId: string;
  label: string;
  seatType: string | null;
  isActive: boolean;
  occupiedHours: number;
  freeHours: number;
  freeWindows: { startLabel: string; endLabel: string; hours: number }[];
  intervals: OccupancyInterval[];
};

export type RevenueRow = {
  key: string;
  count: number;
  revenue: number;
};

export type LibraryOccupancy = {
  date: string;
  timeZone: string;
  closed: boolean;
  openLabel: string | null;
  closeLabel: string | null;
  totalHoursPerSeat: number;
  summary: {
    activeSeats: number;
    fullyFreeSeats: number;
    partiallyFreeSeats: number;
    fullyBookedSeats: number;
    totalSeatHours: number;
    occupiedSeatHours: number;
    utilizationPct: number;
    activeBookings: number;
    activeSubscriptions: number;
  };
  seats: SeatOccupancy[];
  revenue: {
    periodLabel: string;
    total: number;
    byPlan: RevenueRow[];
    bySlot: RevenueRow[];
  };
};

const PLATFORM_FEE = 6; // mirrors create_customer_booking's v_platform_fee
const REVENUE_DAYS = 30;

const HOURS_MS = 3_600_000;

function hoursBetween(a: Date, b: Date) {
  return Math.round(((b.getTime() - a.getTime()) / HOURS_MS) * 100) / 100;
}

function makeLabeler(timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return (d: Date) => fmt.format(d);
}

function addRevenue(map: Map<string, RevenueRow>, key: string, amount: number) {
  const row = map.get(key) ?? { key, count: 0, revenue: 0 };
  row.count += 1;
  row.revenue += amount;
  map.set(key, row);
}

export async function getLibraryOccupancy(
  vendorId: string,
  date: string,
): Promise<LibraryOccupancy> {
  await requireVendorAccess(vendorId, "vendor.read");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");

  const vendor = await prisma.vendor.findUniqueOrThrow({
    where: { id: vendorId },
    select: { timeZone: true },
  });
  const label = makeLabeler(vendor.timeZone);

  const windowRows = await prisma.$queryRaw<{ open_at: Date; close_at: Date }[]>`
    SELECT open_at, close_at FROM admin.vendor_open_window(${vendorId}, ${date}::date)
  `;

  const revenue = await getRevenue(vendorId, label);

  const seats = await prisma.librarySeat.findMany({
    where: { vendorId },
    include: { seatType: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { label: "asc" }],
  });

  if (windowRows.length === 0) {
    return {
      date,
      timeZone: vendor.timeZone,
      closed: true,
      openLabel: null,
      closeLabel: null,
      totalHoursPerSeat: 0,
      summary: {
        activeSeats: seats.filter((s) => s.isActive).length,
        fullyFreeSeats: 0,
        partiallyFreeSeats: 0,
        fullyBookedSeats: 0,
        totalSeatHours: 0,
        occupiedSeatHours: 0,
        utilizationPct: 0,
        activeBookings: 0,
        activeSubscriptions: 0,
      },
      seats: [],
      revenue,
    };
  }

  const { open_at: openAt, close_at: closeAt } = windowRows[0];
  const totalHoursPerSeat = hoursBetween(openAt, closeAt);
  const spanMs = closeAt.getTime() - openAt.getTime();
  const pct = (d: Date) =>
    Math.round(
      Math.min(Math.max(((d.getTime() - openAt.getTime()) / spanMs) * 100, 0), 100) * 10,
    ) / 10;

  const busy = await prisma.$queryRaw<
    {
      seatId: string;
      startAt: Date;
      endAt: Date;
      source: "booking" | "subscription";
      refId: string;
    }[]
  >`
    SELECT s."id" AS "seatId", bi."start_at" AS "startAt", bi."end_at" AS "endAt",
           bi."source" AS "source", bi."ref_id" AS "refId"
    FROM admin.library_seats s
    CROSS JOIN LATERAL admin.seat_busy_intervals(s."id", ${openAt}::timestamptz, ${closeAt}::timestamptz) bi
    WHERE s."vendor_id" = ${vendorId}
    ORDER BY bi."start_at"
  `;

  const bookingIds = busy.filter((b) => b.source === "booking").map((b) => b.refId);
  const subscriptionIds = busy
    .filter((b) => b.source === "subscription")
    .map((b) => b.refId);

  const [bookings, subscriptions] = await Promise.all([
    prisma.booking.findMany({
      where: { id: { in: bookingIds } },
      include: { plan: { select: { name: true, price: true } } },
    }),
    prisma.subscription.findMany({
      where: { id: { in: subscriptionIds } },
      include: { plan: { select: { name: true } } },
    }),
  ]);
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const subscriptionById = new Map(subscriptions.map((s) => [s.id, s]));

  const profiles = await lookupCustomerProfiles(bookings.map((b) => b.userId));

  const busyBySeat = new Map<string, typeof busy>();
  for (const b of busy) {
    const list = busyBySeat.get(b.seatId) ?? [];
    list.push(b);
    busyBySeat.set(b.seatId, list);
  }

  const seatRows: SeatOccupancy[] = seats.map((seat) => {
    const list = busyBySeat.get(seat.id) ?? [];
    const intervals: OccupancyInterval[] = [];
    let cursor = openAt;
    let occupied = 0;
    const freeWindows: SeatOccupancy["freeWindows"] = [];

    for (const b of list) {
      const start = b.startAt < openAt ? openAt : b.startAt;
      const end = b.endAt > closeAt ? closeAt : b.endAt;
      if (start > cursor) {
        freeWindows.push({
          startLabel: label(cursor),
          endLabel: label(start),
          hours: hoursBetween(cursor, start),
        });
      }
      if (end > cursor) {
        occupied += hoursBetween(start > cursor ? start : cursor, end);
        cursor = end;
      }

      if (b.source === "booking") {
        const booking = bookingById.get(b.refId);
        if (!booking) continue;
        const profile = profiles.get(booking.userId);
        intervals.push({
          source: "booking",
          refId: booking.id,
          startLabel: label(b.startAt),
          endLabel: label(b.endAt),
          startPct: pct(b.startAt),
          endPct: pct(b.endAt),
          hours: hoursBetween(b.startAt, b.endAt),
          customerName: profile?.fullName ?? "Customer",
          customerEmail: profile?.email ?? null,
          planName: booking.plan?.name ?? booking.seatLabel ?? "—",
          status: booking.status,
          revenue: bookingRevenue(booking),
          bookingCode: booking.bookingCode,
        });
      } else {
        const sub = subscriptionById.get(b.refId);
        if (!sub) continue;
        intervals.push({
          source: "subscription",
          refId: sub.id,
          startLabel: label(b.startAt),
          endLabel: label(b.endAt),
          startPct: pct(b.startAt),
          endPct: pct(b.endAt),
          hours: hoursBetween(b.startAt, b.endAt),
          customerName: sub.customerName ?? "Customer",
          customerEmail: null,
          planName: sub.plan?.name ?? sub.planName ?? "—",
          status: sub.status,
          revenue: Number(sub.amountPaid),
          bookingCode: null,
        });
      }
    }
    if (cursor < closeAt) {
      freeWindows.push({
        startLabel: label(cursor),
        endLabel: label(closeAt),
        hours: hoursBetween(cursor, closeAt),
      });
    }

    const occupiedHours = Math.round(occupied * 100) / 100;
    return {
      seatId: seat.id,
      label: seat.label,
      seatType: seat.seatType?.name ?? null,
      isActive: seat.isActive,
      occupiedHours,
      freeHours: Math.round((totalHoursPerSeat - occupiedHours) * 100) / 100,
      freeWindows,
      intervals,
    };
  });

  const activeSeatRows = seatRows.filter((s) => s.isActive);
  const occupiedSeatHours = activeSeatRows.reduce((n, s) => n + s.occupiedHours, 0);
  const totalSeatHours = activeSeatRows.length * totalHoursPerSeat;

  return {
    date,
    timeZone: vendor.timeZone,
    closed: false,
    openLabel: label(openAt),
    closeLabel: label(closeAt),
    totalHoursPerSeat,
    summary: {
      activeSeats: activeSeatRows.length,
      fullyFreeSeats: activeSeatRows.filter((s) => s.occupiedHours === 0).length,
      partiallyFreeSeats: activeSeatRows.filter(
        (s) => s.occupiedHours > 0 && s.freeHours > 0,
      ).length,
      fullyBookedSeats: activeSeatRows.filter((s) => s.freeHours <= 0).length,
      totalSeatHours,
      occupiedSeatHours: Math.round(occupiedSeatHours * 100) / 100,
      utilizationPct:
        totalSeatHours > 0
          ? Math.round((occupiedSeatHours / totalSeatHours) * 1000) / 10
          : 0,
      activeBookings: new Set(bookingIds).size,
      activeSubscriptions: new Set(subscriptionIds).size,
    },
    seats: seatRows,
    revenue,
  };
}

function bookingRevenue(booking: {
  amount: unknown;
  plan?: { price: unknown } | null;
}) {
  // Bookings store price + platform fee; the partner earns the plan price.
  if (booking.plan) return Number(booking.plan.price);
  return Math.max(Number(booking.amount) - PLATFORM_FEE, 0);
}

async function getRevenue(
  vendorId: string,
  label: (d: Date) => string,
): Promise<LibraryOccupancy["revenue"]> {
  const since = new Date(Date.now() - REVENUE_DAYS * 24 * HOURS_MS);

  const [bookings, subscriptions] = await Promise.all([
    prisma.booking.findMany({
      where: {
        vendorId,
        seatId: { not: null },
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
        createdAt: { gte: since },
      },
      include: { plan: { select: { name: true, price: true } } },
    }),
    prisma.subscription.findMany({
      where: {
        vendorId,
        seatId: { not: null },
        status: { in: ["ACTIVE", "EXPIRED"] },
        createdAt: { gte: since },
      },
      include: { plan: { select: { name: true } } },
    }),
  ]);

  const byPlan = new Map<string, RevenueRow>();
  const bySlot = new Map<string, RevenueRow>();
  let total = 0;

  for (const b of bookings) {
    const amount = bookingRevenue(b);
    total += amount;
    addRevenue(byPlan, b.plan?.name ?? b.seatLabel ?? "Unknown plan", amount);
    if (b.startAt && b.endAt) {
      addRevenue(bySlot, `${label(b.startAt)} – ${label(b.endAt)}`, amount);
    }
  }
  for (const s of subscriptions) {
    const amount = Number(s.amountPaid);
    total += amount;
    addRevenue(byPlan, s.plan?.name ?? s.planName ?? "Unknown plan", amount);
    if (s.slotStartTime && s.slotHours) {
      const start = s.slotStartTime.toISOString().slice(11, 16);
      const endMinutes =
        (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + s.slotHours * 60) %
        (24 * 60);
      const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(
        endMinutes % 60,
      ).padStart(2, "0")}`;
      addRevenue(bySlot, `${start} – ${end} (subscription)`, amount);
    }
  }

  const sortDesc = (rows: Map<string, RevenueRow>) =>
    [...rows.values()].sort((a, b) => b.revenue - a.revenue);

  return {
    periodLabel: `Last ${REVENUE_DAYS} days`,
    total,
    byPlan: sortDesc(byPlan),
    bySlot: sortDesc(bySlot),
  };
}

export async function cancelLibraryBooking(bookingId: string) {
  const record = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { vendorId: true },
  });
  const session = await requireVendorAccess(record.vendorId, "vendor.update");

  await prisma.$transaction(async (tx) => {
    const before = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (before.status === "CANCELLED" || before.status === "COMPLETED") {
      throw new Error("This booking can no longer be cancelled");
    }
    const after = await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" },
    });
    // Seat-based bookings free their seat automatically (busy intervals only
    // count PENDING/CONFIRMED). Legacy bucket bookings also return capacity.
    if (before.slotId) {
      await tx.$executeRaw`
        UPDATE admin.booking_slots
        SET "available_capacity" = LEAST("available_capacity" + 1, "capacity")
        WHERE "id" = ${before.slotId}
      `;
    }
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CANCEL_BOOKING",
      entityType: "booking",
      entityId: bookingId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });
  });

  revalidatePath(`/vendors/${record.vendorId}`);
}

export async function setLibrarySeatActive(seatId: string, isActive: boolean) {
  const seat = await prisma.librarySeat.findUniqueOrThrow({
    where: { id: seatId },
    select: { vendorId: true },
  });
  const session = await requireVendorAccess(seat.vendorId, "vendor.update");

  await prisma.$transaction(async (tx) => {
    if (!isActive) {
      const now = new Date();
      const [futureBookings, activeSubs] = await Promise.all([
        tx.booking.count({
          where: {
            seatId,
            status: { in: ["PENDING", "CONFIRMED"] },
            endAt: { gt: now },
          },
        }),
        tx.subscription.count({
          where: { seatId, status: "ACTIVE", endDate: { gt: now } },
        }),
      ]);
      if (futureBookings + activeSubs > 0) {
        throw new Error(
          "This seat has active bookings or subscriptions. Cancel them first.",
        );
      }
    }
    await tx.librarySeat.update({ where: { id: seatId }, data: { isActive } });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: isActive ? "ACTIVATE_LIBRARY_SEAT" : "DEACTIVATE_LIBRARY_SEAT",
      entityType: "library_seat",
      entityId: seatId,
      newValue: { isActive },
    });
  });

  revalidatePath(`/vendors/${seat.vendorId}`);
}
