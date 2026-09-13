"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  isSuperAdmin,
  requirePermission,
  requireVendorAccess,
} from "@/lib/rbac";

export async function listReviews(filters: { vendorId?: string } = {}) {
  const session = await requirePermission("review.read");
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

  return prisma.review.findMany({
    where: {
      vendorId: filters.vendorId,
      vendor: actor?.partnerId ? { partnerId: actor.partnerId } : undefined,
    },
    orderBy: { createdAt: "desc" },
    include: { vendor: true },
  });
}

async function setReviewStatus(
  reviewId: string,
  status: "HIDDEN" | "DELETED" | "PUBLISHED",
  permission: "review.hide" | "review.delete" | "review.restore",
  action: "HIDE_REVIEW" | "DELETE_REVIEW" | "RESTORE_REVIEW",
) {
  const review = await prisma.review.findUniqueOrThrow({
    where: { id: reviewId },
    select: { vendorId: true },
  });
  const session = await requireVendorAccess(review.vendorId, permission);

  const vendorId = await prisma.$transaction(async (tx) => {
    const before = await tx.review.findUniqueOrThrow({
      where: { id: reviewId },
    });
    const after = await tx.review.update({
      where: { id: reviewId },
      data: { status },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action,
      entityType: "review",
      entityId: reviewId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });

    return after.vendorId;
  });

  revalidatePath("/reviews");
  revalidatePath(`/vendors/${vendorId}`);
}

export async function hideReview(reviewId: string) {
  return setReviewStatus(reviewId, "HIDDEN", "review.hide", "HIDE_REVIEW");
}

export async function deleteReview(reviewId: string) {
  return setReviewStatus(reviewId, "DELETED", "review.delete", "DELETE_REVIEW");
}

export async function restoreReview(reviewId: string) {
  return setReviewStatus(
    reviewId,
    "PUBLISHED",
    "review.restore",
    "RESTORE_REVIEW",
  );
}
