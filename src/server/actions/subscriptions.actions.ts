"use server";

import { lookupBookingCustomerSnapshots } from "@/lib/booking-customer-snapshots";
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

async function local_listSubscriptions(
  filters: {
    partnerId?: string;
    vendorId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const session = await requirePermission("subscription.read");
  if (filters.vendorId) {
    await requireVendorAccess(filters.vendorId, "vendor.read");
  }

  const partnerId = await getSessionPartnerId(session, filters.partnerId);
  const where = {
    vendorId: filters.vendorId,
    vendor: partnerId ? { partnerId } : undefined,
  };
  const window = pageWindow(filters.page ?? 1, filters.pageSize);

  const [subscriptions, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        vendorId: true,
        customerName: true,
        vendorName: true,
        planName: true,
        startDate: true,
        endDate: true,
        amountPaid: true,
        status: true,
        slotStartTime: true,
        slotHours: true,
        vendor: { select: { name: true } },
        plan: { select: { name: true } },
        seat: { select: { label: true } },
      },
      skip: window.skip,
      take: window.take,
    }),
    prisma.subscription.count({ where }),
  ]);

  // Convert only the displayed amount; related rows expose names alone.
  const snapshots = await lookupBookingCustomerSnapshots(
    subscriptions.map((sub) => sub.id),
  );
  const items = subscriptions.map((sub) => ({
    ...sub,
    customerDetails: snapshots.get(sub.id),
    amountPaid: Number(sub.amountPaid),
  }));
  return toPage(items, total, window);
}

export type SubscriptionRow = Awaited<
  ReturnType<typeof listSubscriptions>
>["items"][number];

async function local_cancelSubscription(subscriptionId: string) {
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

export async function listSubscriptions(
  ...args: Parameters<typeof local_listSubscriptions>
): Promise<Awaited<ReturnType<typeof local_listSubscriptions>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listSubscriptions>>>(
      "subscriptions.actions.listSubscriptions",
      args,
    );
  }
  return local_listSubscriptions(...args);
}

export async function cancelSubscription(
  ...args: Parameters<typeof local_cancelSubscription>
): Promise<Awaited<ReturnType<typeof local_cancelSubscription>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_cancelSubscription>>>(
      "subscriptions.actions.cancelSubscription",
      args,
    );
  }
  return local_cancelSubscription(...args);
}
