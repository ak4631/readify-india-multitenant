"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  isSuperAdmin,
  requirePermission,
  requireVendorAccess,
} from "@/lib/rbac";

export async function listSubscriptions(filters: { vendorId?: string } = {}) {
  const session = await requirePermission("subscription.read");
  if (filters.vendorId) {
    await requireVendorAccess(filters.vendorId, "vendor.read");
  }

  const actor = isSuperAdmin(session)
    ? null
    : await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { partnerId: true },
      });
  if (!isSuperAdmin(session) && !actor?.partnerId) {
    throw new Error("Partner access required");
  }

  return prisma.subscription.findMany({
    where: {
      vendorId: filters.vendorId,
      vendor: actor?.partnerId ? { partnerId: actor.partnerId } : undefined,
    },
    orderBy: { createdAt: "desc" },
    include: { vendor: true, plan: true },
  });
}

export async function cancelSubscription(subscriptionId: string) {
  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    select: { vendorId: true },
  });
  const session = await requireVendorAccess(
    subscription.vendorId,
    "subscription.cancel",
  );

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
