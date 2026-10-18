"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  getSessionPartnerId,
  requirePermission,
  requirePlatformPermission,
  requireVendorAccess,
} from "@/lib/rbac";

export async function listReviews(filters: { vendorId?: string } = {}) {
  const session = await requirePermission("review.read");
  if (filters.vendorId) {
    await requireVendorAccess(filters.vendorId, "vendor.read");
  }

  const partnerId = await getSessionPartnerId(session);

  const reviews = await prisma.review.findMany({
    where: {
      vendorId: filters.vendorId,
      vendor: partnerId ? { partnerId } : undefined,
    },
    orderBy: { createdAt: "desc" },
    include: { vendor: true },
  });

  // Decimal (Vendor.averageRating) is a class instance, not a plain object --
  // Next.js refuses to pass it from this Server Action to a Client Component
  // (ReviewTable receives this array as a prop).
  return reviews.map((review) => ({
    ...review,
    vendor: review.vendor
      ? {
          ...review.vendor,
          averageRating: review.vendor.averageRating
            ? Number(review.vendor.averageRating)
            : null,
        }
      : review.vendor,
  }));
}

export type ReviewRow = Awaited<ReturnType<typeof listReviews>>[number];

async function setReviewStatus(
  reviewId: string,
  status: "HIDDEN" | "DELETED" | "PUBLISHED",
  permission: "review.hide" | "review.delete" | "review.restore",
  action: "HIDE_REVIEW" | "DELETE_REVIEW" | "RESTORE_REVIEW",
) {
  const moderator = await requirePlatformPermission(permission);
  const session = moderator;

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

export async function replyToReview(reviewId: string, reply: string) {
  const text = z.string().trim().min(1).max(2000).parse(reply);
  const review = await prisma.review.findUniqueOrThrow({
    where: { id: reviewId },
  });
  const session = await requireVendorAccess(review.vendorId, "vendor.update");
  if (!session.user.roles.includes("PARTNER_ADMIN"))
    throw new Error("Only the partner owner can reply to reviews");
  await prisma.$transaction(async (tx) => {
    const current = await tx.review.findUniqueOrThrow({
      where: { id: reviewId },
    });
    if (current.status !== "PUBLISHED")
      throw new Error("Only published reviews can receive a reply");
    await tx.review.update({
      where: { id: reviewId },
      data: { ownerReply: text, repliedAt: new Date() },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "REPLY_REVIEW",
      entityType: "review",
      entityId: reviewId,
      newValue: { ownerReply: text },
    });
  });
  revalidatePath("/reviews");
  revalidatePath(`/vendors/${review.vendorId}`);
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
