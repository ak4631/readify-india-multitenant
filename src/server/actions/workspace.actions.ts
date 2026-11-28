"use server";

import { paymentListFilters } from "@/lib/payment-list-filters";
import { pageWindow, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import {
  getAccessibleVendorIds,
  getSessionPartnerId,
  requirePermission,
} from "@/lib/rbac";
import { requireOwner } from "@/lib/owner-access";

async function summary(vendorIds: string[] | null) {
  const where = vendorIds ? { vendorId: { in: vendorIds } } : {};
  const [
    listings,
    visits,
    flex,
    subscriptions,
    present,
    captured,
    refunded,
    pendingChanges,
    today,
    occupancy,
  ] = await Promise.all([
    prisma.vendor.count({ where: vendorIds ? { id: { in: vendorIds } } : {} }),
    prisma.booking.count({ where }),
    prisma.flexBooking.count({ where }),
    prisma.subscription.count({
      where: { ...where, status: "ACTIVE", endDate: { gt: new Date() } },
    }),
    prisma.attendanceVisit.count({ where: { ...where, checkedOutAt: null } }),
    prisma.paymentOrder.aggregate({
      where: { ...where, capturedAt: { not: null } },
      _sum: { amountPaise: true },
    }),
    prisma.paymentOrder.aggregate({
      where: { ...where, status: "REFUNDED" },
      _sum: { amountPaise: true },
    }),
    prisma.listingRevision.count({
      where: {
        ...(vendorIds ? { vendorId: { in: vendorIds } } : {}),
        status: "PENDING",
      },
    }),
    prisma.$queryRaw<
      { bookings: number; arrivals: number; departures: number }[]
    >`
      SELECT (SELECT count(*)::int FROM (
        SELECT b.id FROM admin.bookings b JOIN admin.vendors v ON v.id=b.vendor_id WHERE (${vendorIds}::text[] IS NULL OR v.id=ANY(${vendorIds}::text[])) AND b.booking_date::date=(now() AT TIME ZONE v.time_zone)::date AND b.status IN ('PENDING','CONFIRMED','COMPLETED')
        UNION ALL SELECT f.id FROM admin.flex_bookings f JOIN admin.vendors v ON v.id=f.vendor_id WHERE (${vendorIds}::text[] IS NULL OR v.id=ANY(${vendorIds}::text[])) AND f.start_date<=(now() AT TIME ZONE v.time_zone)::date AND f.start_date+f.days>(now() AT TIME ZONE v.time_zone)::date AND f.status IN ('PENDING','CONFIRMED','COMPLETED')
      ) entries) AS bookings,
      (SELECT count(*)::int FROM admin.attendance_visits a JOIN admin.vendors v ON v.id=a.vendor_id WHERE (${vendorIds}::text[] IS NULL OR v.id=ANY(${vendorIds}::text[])) AND (a.checked_in_at AT TIME ZONE v.time_zone)::date=(now() AT TIME ZONE v.time_zone)::date) AS arrivals,
      (SELECT count(*)::int FROM admin.attendance_visits a JOIN admin.vendors v ON v.id=a.vendor_id WHERE (${vendorIds}::text[] IS NULL OR v.id=ANY(${vendorIds}::text[])) AND (a.checked_out_at AT TIME ZONE v.time_zone)::date=(now() AT TIME ZONE v.time_zone)::date) AS departures
    `,
    prisma.$queryRaw<
      { total_seat_hours: unknown; reserved_seat_hours: unknown }[]
    >`SELECT total_seat_hours, reserved_seat_hours FROM admin.library_occupancy_summary(${vendorIds}::text[])`,
  ]);
  return {
    listings,
    visits,
    flex,
    subscriptions,
    present,
    pendingChanges,
    totalSeatHours: Number(occupancy[0]?.total_seat_hours ?? 0),
    reservedSeatHours: Number(occupancy[0]?.reserved_seat_hours ?? 0),
    todayBookings: today[0]?.bookings ?? 0,
    arrivals: today[0]?.arrivals ?? 0,
    departures: today[0]?.departures ?? 0,
    capturedPaise: captured._sum.amountPaise ?? 0,
    refundedPaise: refunded._sum.amountPaise ?? 0,
  };
}

async function local_getWorkspaceSummary(selectedPartnerId?: string) {
  const session = await requirePermission("vendor.read");
  return summary(await getAccessibleVendorIds(session, selectedPartnerId));
}

async function local_getOwnerControlPanel() {
  const { partnerId } = await requireOwner();
  const vendors = await prisma.vendor.findMany({
    where: { partnerId },
    select: { id: true },
  });
  return summary(vendors.map((vendor) => vendor.id));
}

async function local_listWorkspaceAttendance(selectedPartnerId?: string) {
  const session = await requirePermission("vendor.read");
  const ids = await getAccessibleVendorIds(session, selectedPartnerId);
  const rows = await prisma.attendanceVisit.findMany({
    where: { ...(ids ? { vendorId: { in: ids } } : {}), checkedOutAt: null },
    orderBy: { checkedInAt: "desc" },
    take: 200,
  });
  return rows;
}

async function local_listPaymentLedger(
  page = 1,
  selectedPartnerId?: string,
  filters: {
    q?: string;
    vendorId?: string;
    status?: string;
    date?: string;
  } = {},
) {
  const session = await requirePermission("subscription.read");
  const partnerId = await getSessionPartnerId(session, selectedPartnerId);
  const scope = partnerId
    ? {
        vendorId: {
          in: (
            await prisma.vendor.findMany({
              where: { partnerId },
              select: { id: true },
            })
          ).map((vendor) => vendor.id),
        },
      }
    : {};
  const where = {
    ...scope,
    AND: await paymentListFilters(filters),
  };
  const window = pageWindow(page);
  const [orders, total] = await Promise.all([
    prisma.paymentOrder.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: window.skip,
      take: window.take,
      select: {
        id: true,
        vendorId: true,
        targetType: true,
        amountPaise: true,
        status: true,
        capturedAt: true,
        refundId: true,
        createdAt: true,
      },
    }),
    prisma.paymentOrder.count({ where }),
  ]);
  const vendors = orders.length
    ? await prisma.vendor.findMany({
        where: {
          id: { in: [...new Set(orders.map((order) => order.vendorId))] },
        },
        select: { id: true, name: true },
      })
    : [];
  const vendorNames = new Map(
    vendors.map((vendor) => [vendor.id, vendor.name]),
  );
  const items = orders.map((order) => ({
    id: order.id,
    vendorName: vendorNames.get(order.vendorId) ?? "Listing",
    kind: order.targetType,
    amountPaise: order.amountPaise,
    status: order.status,
    capturedAt: order.capturedAt,
    refundId: order.refundId,
    createdAt: order.createdAt,
  }));
  return toPage(items, total, window);
}

async function local_listPaymentListingOptions(partnerId?: string) {
  const session = await requirePermission("subscription.read");
  const ids = await getAccessibleVendorIds(session, partnerId);
  return prisma.vendor.findMany({
    where: ids ? { id: { in: ids } } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getWorkspaceSummary(
  ...args: Parameters<typeof local_getWorkspaceSummary>
): Promise<Awaited<ReturnType<typeof local_getWorkspaceSummary>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getWorkspaceSummary>>>(
      "workspace.actions.getWorkspaceSummary",
      args,
    );
  }
  return local_getWorkspaceSummary(...args);
}

export async function getOwnerControlPanel(
  ...args: Parameters<typeof local_getOwnerControlPanel>
): Promise<Awaited<ReturnType<typeof local_getOwnerControlPanel>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getOwnerControlPanel>>>(
      "workspace.actions.getOwnerControlPanel",
      args,
    );
  }
  return local_getOwnerControlPanel(...args);
}

export async function listWorkspaceAttendance(
  ...args: Parameters<typeof local_listWorkspaceAttendance>
): Promise<Awaited<ReturnType<typeof local_listWorkspaceAttendance>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_listWorkspaceAttendance>>
    >("workspace.actions.listWorkspaceAttendance", args);
  }
  return local_listWorkspaceAttendance(...args);
}

export async function listPaymentLedger(
  ...args: Parameters<typeof local_listPaymentLedger>
): Promise<Awaited<ReturnType<typeof local_listPaymentLedger>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listPaymentLedger>>>(
      "workspace.actions.listPaymentLedger",
      args,
    );
  }
  return local_listPaymentLedger(...args);
}

export async function listPaymentListingOptions(
  ...args: Parameters<typeof local_listPaymentListingOptions>
): Promise<Awaited<ReturnType<typeof local_listPaymentListingOptions>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_listPaymentListingOptions>>
    >("workspace.actions.listPaymentListingOptions", args);
  }
  return local_listPaymentListingOptions(...args);
}
