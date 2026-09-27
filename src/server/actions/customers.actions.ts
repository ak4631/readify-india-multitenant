"use server";

import { prisma } from "@/lib/prisma";
import { getSessionPartnerId, requirePermission } from "@/lib/rbac";
import { listCustomerProfiles, lookupCustomerProfiles } from "@/lib/profiles";

// One row shape for both the platform-staff view (all app users, with their
// account role/status) and the partner-scoped view (only customers who have
// booked/subscribed with THIS partner's listings, with booking/spend stats
// instead) -- CustomerTable picks which columns to show via `scope`.
export type CustomerRow = {
  id: string;
  fullName: string | null;
  email: string | null;
  // Platform scope only:
  role: string | null;
  isActive: boolean | null;
  // Partner scope only:
  totalBookings: number | null;
  activeSubscriptions: number | null;
  totalSpent: number | null;
  lastActivityAt: Date | null;
  // Platform scope: account creation date. Partner scope: first booking/
  // subscription with this partner.
  joinedAt: Date;
};

export type CustomersResult = {
  scope: "platform" | "partner";
  customers: CustomerRow[];
};

export async function listCustomers(): Promise<CustomersResult> {
  const session = await requirePermission("customer.read");
  const partnerId = await getSessionPartnerId(session);

  if (!partnerId) {
    const profiles = await listCustomerProfiles();
    return {
      scope: "platform",
      customers: profiles.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        email: p.email,
        role: p.role,
        isActive: p.isActive,
        totalBookings: null,
        activeSubscriptions: null,
        totalSpent: null,
        lastActivityAt: null,
        joinedAt: p.createdAt,
      })),
    };
  }

  return { scope: "partner", customers: await listPartnerCustomers(partnerId) };
}

async function listPartnerCustomers(partnerId: string): Promise<CustomerRow[]> {
  const vendors = await prisma.vendor.findMany({
    where: { partnerId },
    select: { id: true },
  });
  const vendorIds = vendors.map((v) => v.id);
  if (vendorIds.length === 0) return [];

  const [bookingStats, subscriptions] = await Promise.all([
    prisma.booking.groupBy({
      by: ["userId"],
      where: { vendorId: { in: vendorIds } },
      _count: { _all: true },
      _sum: { amount: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    prisma.subscription.findMany({
      where: { vendorId: { in: vendorIds } },
      select: {
        userId: true,
        status: true,
        amountPaid: true,
        createdAt: true,
      },
    }),
  ]);

  // Track first-seen/last-seen as nullable and only ever widen the range --
  // simpler and less error-prone than trying to detect "is this the first
  // event for this user" from the aggregate counters.
  type PartnerAccumulator = Omit<CustomerRow, "joinedAt"> & { joinedAt: Date | null };
  const byUser = new Map<string, PartnerAccumulator>();
  const rowFor = (userId: string) => {
    let row = byUser.get(userId);
    if (!row) {
      row = {
        id: userId,
        fullName: null,
        email: null,
        role: null,
        isActive: null,
        totalBookings: 0,
        activeSubscriptions: 0,
        totalSpent: 0,
        lastActivityAt: null,
        joinedAt: null,
      };
      byUser.set(userId, row);
    }
    return row;
  };
  const widen = (row: PartnerAccumulator, at: Date) => {
    if (!row.joinedAt || at < row.joinedAt) row.joinedAt = at;
    if (!row.lastActivityAt || at > row.lastActivityAt) row.lastActivityAt = at;
  };

  for (const stat of bookingStats) {
    const row = rowFor(stat.userId);
    if (stat._min.createdAt) widen(row, stat._min.createdAt);
    if (stat._max.createdAt) widen(row, stat._max.createdAt);
    row.totalBookings = stat._count._all;
    row.totalSpent = (row.totalSpent ?? 0) + Number(stat._sum.amount ?? 0);
  }
  for (const sub of subscriptions) {
    const row = rowFor(sub.userId);
    widen(row, sub.createdAt);
    if (sub.status === "ACTIVE") {
      row.activeSubscriptions = (row.activeSubscriptions ?? 0) + 1;
    }
    row.totalSpent = (row.totalSpent ?? 0) + Number(sub.amountPaid);
  }

  const profiles = await lookupCustomerProfiles([...byUser.keys()]);
  for (const row of byUser.values()) {
    const profile = profiles.get(row.id);
    row.fullName = profile?.fullName ?? null;
    row.email = profile?.email ?? null;
  }

  return [...byUser.values()]
    .sort((a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0))
    // joinedAt is always set by this point -- every row was created by a
    // booking or subscription event, and both branches above call widen().
    .map((row) => ({ ...row, joinedAt: row.joinedAt as Date }));
}
