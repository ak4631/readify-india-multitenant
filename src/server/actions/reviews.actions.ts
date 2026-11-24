"use server";

import { PublicActionError } from "@/lib/public-action-error";
import { queueListingChange } from "@/lib/listing-changes";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { pageWindow, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import {
  getSessionPartnerId,
  requirePermission,
  requirePlatformPermission,
  requireVendorAccess,
} from "@/lib/rbac";

async function local_listReviews(
  filters: {
    partnerId?: string;
    vendorId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const session = await requirePermission("review.read");
  if (filters.vendorId) {
    await requireVendorAccess(filters.vendorId, "vendor.read");
  }

  const partnerId = await getSessionPartnerId(session, filters.partnerId);
  const where = {
    vendorId: filters.vendorId,
    vendor: partnerId ? { partnerId } : undefined,
  };
  const window = pageWindow(filters.page ?? 1, filters.pageSize);

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { vendor: true },
      skip: window.skip,
      take: window.take,
    }),
    prisma.review.count({ where }),
  ]);

  // Decimal (Vendor.averageRating) is a class instance, not a plain object --
  // Next.js refuses to pass it from this Server Action to a Client Component
  // (ReviewTable receives this array as a prop).
  const items = reviews.map((review) => ({
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
  return toPage(items, total, window);
}

export type ReviewRow = Awaited<
  ReturnType<typeof listReviews>
>["items"][number];

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

async function local_replyToReview(reviewId: string, reply: string) {
  const text = z.string().trim().min(1).max(2000).parse(reply);
  const review = await prisma.review.findUniqueOrThrow({
    where: { id: reviewId },
  });
  const session = await requireVendorAccess(review.vendorId, "vendor.update");
  if (!session.user.roles.includes("PARTNER_ADMIN"))
    throw new PublicActionError("Only the partner owner can reply to reviews");
  await prisma.$transaction(async (tx) => {
    const current = await tx.review.findUniqueOrThrow({
      where: { id: reviewId },
    });
    if (current.status !== "PUBLISHED")
      throw new PublicActionError("Only published reviews can receive a reply");
    if (
      await queueListingChange(
        tx,
        review.vendorId,
        session.user.id,
        "REVIEW_REPLY",
        reviewId,
        { reply: text },
      )
    )
      return;
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

async function local_hideReview(reviewId: string) {
  return setReviewStatus(reviewId, "HIDDEN", "review.hide", "HIDE_REVIEW");
}

async function local_deleteReview(reviewId: string) {
  return setReviewStatus(reviewId, "DELETED", "review.delete", "DELETE_REVIEW");
}

async function local_restoreReview(reviewId: string) {
  return setReviewStatus(
    reviewId,
    "PUBLISHED",
    "review.restore",
    "RESTORE_REVIEW",
  );
}

export async function listReviews(
  ...args: Parameters<typeof local_listReviews>
): Promise<Awaited<ReturnType<typeof local_listReviews>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listReviews>>>(
      "reviews.actions.listReviews",
      args,
    );
  }
  return local_listReviews(...args);
}

export async function replyToReview(
  ...args: Parameters<typeof local_replyToReview>
): Promise<Awaited<ReturnType<typeof local_replyToReview>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_replyToReview>>>(
      "reviews.actions.replyToReview",
      args,
    );
  }
  return local_replyToReview(...args);
}

export async function hideReview(
  ...args: Parameters<typeof local_hideReview>
): Promise<Awaited<ReturnType<typeof local_hideReview>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_hideReview>>>(
      "reviews.actions.hideReview",
      args,
    );
  }
  return local_hideReview(...args);
}

export async function deleteReview(
  ...args: Parameters<typeof local_deleteReview>
): Promise<Awaited<ReturnType<typeof local_deleteReview>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_deleteReview>>>(
      "reviews.actions.deleteReview",
      args,
    );
  }
  return local_deleteReview(...args);
}

export async function restoreReview(
  ...args: Parameters<typeof local_restoreReview>
): Promise<Awaited<ReturnType<typeof local_restoreReview>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_restoreReview>>>(
      "reviews.actions.restoreReview",
      args,
    );
  }
  return local_restoreReview(...args);
}
