"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function getDashboardMetrics() {
  await requirePermission("dashboard.read");

  const [
    totalVendors,
    activeVendors,
    pendingVendors,
    rejectedVendors,
    totalUsers,
    totalBookings,
    categoryDistribution,
    recentVendors,
  ] = await Promise.all([
    prisma.vendor.count(),
    prisma.vendor.count({ where: { status: "PUBLISHED" } }),
    prisma.vendor.count({
      where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
    }),
    prisma.vendor.count({ where: { status: "REJECTED" } }),
    prisma.user.count(),
    prisma.booking.count(),
    prisma.vendor.groupBy({ by: ["categoryId"], _count: { _all: true } }),
    prisma.vendor.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { category: true },
    }),
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
