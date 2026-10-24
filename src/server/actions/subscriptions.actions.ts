"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { pageWindow, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { cancelPaidPurchase } from "@/lib/payments";
import {
  getSessionPartnerId,
  requirePermission,
  requireVendorAccess,
} from "@/lib/rbac";

export async function listSubscriptions(
  filters: { vendorId?: string; page?: number; pageSize?: number } = {},
) {
  const session = await requirePermission("subscription.read");
  if (filters.vendorId) {
    await requireVendorAccess(filters.vendorId, "vendor.read");
  }

  const partnerId = await getSessionPartnerId(session);
  const where = {
    vendorId: filters.vendorId,
    vendor: partnerId ? { partnerId } : undefined,
  };
  const window = pageWindow(filters.page ?? 1, filters.pageSize);

  const [subscriptions, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { vendor: true, plan: true, seat: { select: { label: true } } },
      skip: window.skip,
      take: window.take,
    }),
    prisma.subscription.count({ where }),
  ]);

  // Decimal is a class instance, not a plain object -- Next.js refuses to
  // pass it from this Server Action to a Client Component (SubscriptionTable
  // receives this array as a prop, and also calls this action directly from
  // the client for cancellation refreshes). Three fields here are Decimal:
  // the subscription's own amountPaid, plus vendor.averageRating and
  // plan.price pulled in by the includes above.
  const items = subscriptions.map((sub) => ({
    ...sub,
    amountPaid: Number(sub.amountPaid),
    vendor: sub.vendor
      ? {
          ...sub.vendor,
          averageRating: sub.vendor.averageRating
            ? Number(sub.vendor.averageRating)
            : null,
        }
      : sub.vendor,
    plan: sub.plan ? { ...sub.plan, price: Number(sub.plan.price) } : sub.plan,
  }));
  return toPage(items, total, window);
}

export type SubscriptionRow = Awaited<
  ReturnType<typeof listSubscriptions>
>["items"][number];

export async function cancelSubscription(subscriptionId: string) {
  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    select: { vendorId: true },
  });
  const session = await requireVendorAccess(
    subscription.vendorId,
    "subscription.cancel",
  );
  const payment = await prisma.paymentOrder.findUnique({
    where: { targetId: subscriptionId },
  });
  if (payment) {
    await cancelPaidPurchase(subscriptionId, {
      userId: session.user.id,
      kind: "partner",
    });
    revalidatePath("/subscriptions");
    revalidatePath(`/vendors/${subscription.vendorId}`);
    return;
  }

  const vendorId = await prisma.$transaction(async (tx) => {
    const before = await tx.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });
    const after = await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: "CANCELLED" },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CANCEL_SUBSCRIPTION",
      entityType: "subscription",
      entityId: subscriptionId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });

    return after.vendorId;
  });

  revalidatePath("/subscriptions");
  revalidatePath(`/vendors/${vendorId}`);
}
