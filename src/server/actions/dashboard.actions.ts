"use server";

import { LIVE_LISTING_WHERE } from "@/lib/live-listing";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/rbac";

async function local_getDashboardMetrics() {
  await requirePlatformPermission("dashboard.read");

  // One grouped scan replaces five vendor counts, a category lookup and an
  // unused recent-listings fetch. Only aggregates cross the database boundary.
  const [
    vendorStats,
    totalUsers,
    totalBookings,
    activePartners,
    pendingPartners,
    pendingRevisions,
    pendingDocuments,
    openSupport,
    pendingRefunds,
  ] = await Promise.all([
    prisma.$queryRaw<
      { status: string; category: string; live: boolean; count: number }[]
    >`
      SELECT v.status::text, c.name AS category,
        (v.status='PUBLISHED' AND p.status='ACTIVE' AND p.approval_status='APPROVED'
          AND c.status='ACTIVE' AND c.launch_enabled) AS live, count(*)::int AS count
      FROM admin.vendors v JOIN admin.partners p ON p.id=v.partner_id
      JOIN admin.vendor_categories c ON c.id=v.category_id
      GROUP BY v.status,c.name,p.status,p.approval_status,c.status,c.launch_enabled`,
    prisma.user.count(),
    prisma.booking.count(),
    prisma.partner.count({ where: { vendors: { some: LIVE_LISTING_WHERE } } }),
    prisma.partner.count({ where: { approvalStatus: "PENDING" } }),
    prisma.listingRevision.count({ where: { status: "PENDING" } }),
    prisma.vendorVerification.count({
      where: {
        status: "PENDING",
        vendor: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      },
    }),
    prisma.supportTicket.count({ where: { status: "OPEN" } }),
    prisma.paymentOrder.count({ where: { status: "REFUND_PENDING" } }),
  ]);
  const countWhere = (
    predicate: (row: (typeof vendorStats)[number]) => boolean,
  ) =>
    vendorStats.reduce(
      (total, row) => total + (predicate(row) ? row.count : 0),
      0,
    );
  const totalVendors = countWhere(() => true);
  const activeVendors = countWhere((row) => row.live);
  const pendingVendors = countWhere((row) =>
    ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(row.status),
  );
  const rejectedVendors = countWhere((row) => row.status === "REJECTED");
  const suspendedVendors = countWhere((row) => row.status === "SUSPENDED");
  const categoryCounts = new Map<string, number>();
  for (const row of vendorStats)
    if (row.live)
      categoryCounts.set(
        row.category,
        (categoryCounts.get(row.category) ?? 0) + row.count,
      );

  return {
    totalVendors,
    activeVendors,
    pendingVendors,
    rejectedVendors,
    totalUsers,
    totalBookings,
    activePartners,
    pendingPartners,
    pendingRevisions,
    pendingDocuments,
    openSupport,
    pendingRefunds,
    suspendedVendors,
    categoryDistribution: [...categoryCounts].map(([category, count]) => ({
      category,
      count,
    })),
  };
}

export type DashboardMetrics = Awaited<ReturnType<typeof getDashboardMetrics>>;

export async function getDashboardMetrics(
  ...args: Parameters<typeof local_getDashboardMetrics>
): Promise<Awaited<ReturnType<typeof local_getDashboardMetrics>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getDashboardMetrics>>>(
      "dashboard.actions.getDashboardMetrics",
      args,
    );
  }
  return local_getDashboardMetrics(...args);
}
