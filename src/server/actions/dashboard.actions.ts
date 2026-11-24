"use server";

import { LIVE_LISTING_WHERE } from "@/lib/live-listing";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/rbac";

async function local_getDashboardMetrics() {
  await requirePlatformPermission("dashboard.read");

  const [
    totalVendors,
    activeVendors,
    pendingVendors,
    rejectedVendors,
    totalUsers,
    totalBookings,
    categoryDistribution,
    recentVendors,
    activePartners,
    pendingPartners,
    pendingRevisions,
    pendingDocuments,
    openSupport,
    pendingRefunds,
    suspendedVendors,
  ] = await Promise.all([
    prisma.vendor.count(),
    prisma.vendor.count({ where: LIVE_LISTING_WHERE }),
    prisma.vendor.count({
      where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] } },
    }),
    prisma.vendor.count({ where: { status: "REJECTED" } }),
    prisma.user.count(),
    prisma.booking.count(),
    prisma.vendor.groupBy({
      where: LIVE_LISTING_WHERE,
      by: ["categoryId"],
      _count: { _all: true },
    }),
    prisma.vendor.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { category: true },
    }),
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
    prisma.vendor.count({ where: { status: "SUSPENDED" } }),
  ]);

  const categories = await prisma.vendorCategory.findMany();
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

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
    categoryDistribution: categoryDistribution.map((row) => ({
      category: categoryMap.get(row.categoryId) ?? "Unknown",
      count: row._count._all,
    })),
    // Prisma's Decimal is a class instance, not a plain object -- Next.js
    // refuses to pass it from this Server Action to a Client Component
    // (DashboardContent gets this whole object as a prop, and also calls
    // this action directly from the client via react-query, which has the
    // same plain-serializable-value requirement).
    recentVendors: recentVendors.map((vendor) => ({
      ...vendor,
      averageRating: vendor.averageRating ? Number(vendor.averageRating) : null,
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
