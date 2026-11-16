import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";

export const AUDIT_ACTIONS = [
  "SAVE_PROMOTIONAL_BANNER",
  "DEACTIVATE_PROMOTIONAL_BANNER",
  "REVIEW_PARTNER_APPLICATION",
  "SUPPORT_CREATE",
  "SUPPORT_RESOLVE",
  "CHECK_IN",
  "CHECK_OUT",
  "REQUEST_LISTING_CHANGE",
  "APPROVE_LISTING_CHANGE",
  "REJECT_LISTING_CHANGE",
  "REPLY_REVIEW",
  "CREATE_PARTNER",
  "UPDATE_PARTNER",
  "ACTIVATE_PARTNER",
  "DEACTIVATE_PARTNER",
  "CREATE_PARTNER_USER",
  "UPDATE_PARTNER_USER",
  "ACTIVATE_PARTNER_USER",
  "DEACTIVATE_PARTNER_USER",
  "SUSPEND_USER",
  "ACTIVATE_USER",
  "CREATE_VENDOR_ACCOUNT",
  "CREATE_VENDOR_CATEGORY",
  "UPDATE_VENDOR_CATEGORY",
  "DEACTIVATE_VENDOR_CATEGORY",
  "CREATE_VENDOR_DRAFT",
  "UPDATE_VENDOR_ADDRESS",
  "UPDATE_VENDOR_PROFILE",
  "UPDATE_VENDOR_CAPACITY",
  "SUBMIT_VENDOR_FOR_REVIEW",
  "APPROVE_VENDOR",
  "REJECT_VENDOR",
  "SUSPEND_VENDOR",
  "PUBLISH_VENDOR",
  "UPLOAD_VERIFICATION_DOCUMENT",
  "APPROVE_VERIFICATION",
  "REJECT_VERIFICATION",
  "CREATE_FACILITY",
  "UPDATE_FACILITY",
  "DEACTIVATE_FACILITY",
  "UPDATE_VENDOR_FACILITIES",
  "CREATE_MEMBERSHIP_PLAN",
  "UPDATE_MEMBERSHIP_PLAN",
  "ARCHIVE_MEMBERSHIP_PLAN",
  "UPDATE_VENDOR_SCHEDULE",
  "UPLOAD_VENDOR_MEDIA",
  "DELETE_VENDOR_MEDIA",
  "SET_PRIMARY_VENDOR_MEDIA",
  "HIDE_REVIEW",
  "DELETE_REVIEW",
  "RESTORE_REVIEW",
  "CREATE_LIBRARY_SEAT_TYPE",
  "UPDATE_LIBRARY_SEAT_TYPE",
  "DELETE_LIBRARY_SEAT_TYPE",
  "CREATE_TRAINER",
  "UPDATE_TRAINER",
  "DEACTIVATE_TRAINER",
  "UPDATE_TRAINER_SPECIALIZATIONS",
  "CREATE_TRAINER_PRICING",
  "DELETE_TRAINER_PRICING",
  "UPDATE_TRAINER_AVAILABILITY",
  "CREATE_MENU_CATEGORY",
  "DELETE_MENU_CATEGORY",
  "CREATE_MENU_ITEM",
  "UPDATE_MENU_ITEM",
  "DELETE_MENU_ITEM",
  "CREATE_TEACHER",
  "UPDATE_TEACHER",
  "DEACTIVATE_TEACHER",
  "CREATE_COURSE",
  "UPDATE_COURSE",
  "ARCHIVE_COURSE",
  "CREATE_LECTURE",
  "UPDATE_LECTURE",
  "CANCEL_LECTURE",
  "CANCEL_SUBSCRIPTION",
  "CANCEL_BOOKING",
  "ACTIVATE_LIBRARY_SEAT",
  "DEACTIVATE_LIBRARY_SEAT",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntityType =
  | "promotional_banner"
  | "customer_support"
  | "support"
  | "attendance"
  | "listing_change"
  | "partner"
  | "user"
  | "vendor"
  | "vendor_category"
  | "vendor_verification"
  | "facility"
  | "membership_plan"
  | "vendor_schedule"
  | "vendor_media"
  | "review"
  | "library_seat_type"
  | "trainer"
  | "trainer_pricing"
  | "trainer_availability"
  | "menu_category"
  | "menu_item"
  | "teacher"
  | "course"
  | "lecture"
  | "subscription"
  | "booking"
  | "library_seat";

interface AuditLogEntry {
  partnerId?: string;
  userId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

// Call this inside the same prisma.$transaction as the mutation it records,
// so the mutation and its audit trail succeed or fail together.
export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  entry: AuditLogEntry,
): Promise<void> {
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ipAddress = h.get("x-forwarded-for");
    userAgent = h.get("user-agent");
  } catch {
    // headers() is unavailable outside a request scope (e.g. seed scripts) — leave null.
  }

  const old =
    entry.oldValue && typeof entry.oldValue === "object"
      ? (entry.oldValue as Record<string, unknown>)
      : {};
  const current =
    entry.newValue && typeof entry.newValue === "object"
      ? (entry.newValue as Record<string, unknown>)
      : {};
  let partnerId = entry.partnerId ?? null;
  let vendorId =
    typeof current.vendorId === "string"
      ? current.vendorId
      : typeof old.vendorId === "string"
        ? old.vendorId
        : null;
  if (entry.entityType === "partner") partnerId = entry.entityId ?? null;
  if (entry.entityType === "vendor") vendorId = entry.entityId ?? null;
  const lookups: Partial<
    Record<
      AuditEntityType,
      (id: string) => Promise<{ vendorId: string } | null>
    >
  > = {
    trainer: (id) =>
      tx.trainer.findUnique({ where: { id }, select: { vendorId: true } }),
    teacher: (id) =>
      tx.teacher.findUnique({ where: { id }, select: { vendorId: true } }),
    course: (id) =>
      tx.course.findUnique({ where: { id }, select: { vendorId: true } }),
    membership_plan: (id) =>
      tx.membershipPlan.findUnique({
        where: { id },
        select: { vendorId: true },
      }),
    library_seat_type: (id) =>
      tx.librarySeatType.findUnique({
        where: { id },
        select: { vendorId: true },
      }),
    library_seat: (id) =>
      tx.librarySeat.findUnique({ where: { id }, select: { vendorId: true } }),
    vendor_media: (id) =>
      tx.vendorMedia.findUnique({ where: { id }, select: { vendorId: true } }),
    vendor_verification: (id) =>
      tx.vendorVerification.findUnique({
        where: { id },
        select: { vendorId: true },
      }),
    booking: (id) =>
      tx.booking.findUnique({ where: { id }, select: { vendorId: true } }),
    subscription: (id) =>
      tx.subscription.findUnique({ where: { id }, select: { vendorId: true } }),
    review: (id) =>
      tx.review.findUnique({ where: { id }, select: { vendorId: true } }),
    attendance: (id) =>
      tx.attendanceVisit.findUnique({
        where: { id },
        select: { vendorId: true },
      }),
    listing_change: async (id) =>
      (await tx.listingRevision.findUnique({
        where: { id },
        select: { vendorId: true },
      })) ??
      tx.listingChange.findUnique({
        where: { id },
        select: { vendorId: true },
      }),
    menu_category: (id) =>
      tx.menuCategory.findUnique({ where: { id }, select: { vendorId: true } }),
    menu_item: async (id) => {
      const r = await tx.menuItem.findUnique({
        where: { id },
        select: { category: { select: { vendorId: true } } },
      });
      return r?.category ?? null;
    },
    trainer_pricing: async (id) => {
      const r = await tx.trainerPricing.findUnique({
        where: { id },
        select: { trainer: { select: { vendorId: true } } },
      });
      return r?.trainer ?? null;
    },
    lecture: async (id) => {
      const r = await tx.lecture.findUnique({
        where: { id },
        select: { course: { select: { vendorId: true } } },
      });
      return r?.course ?? null;
    },
  };
  if (!vendorId && !partnerId && entry.entityId && lookups[entry.entityType])
    vendorId =
      (await lookups[entry.entityType]!(entry.entityId))?.vendorId ?? null;
  if (!partnerId && vendorId)
    partnerId =
      (
        await tx.vendor.findUnique({
          where: { id: vendorId },
          select: { partnerId: true },
        })
      )?.partnerId ?? null;
  if (!partnerId && entry.entityType === "user" && entry.entityId)
    partnerId =
      (
        await tx.user.findUnique({
          where: { id: entry.entityId },
          select: { partnerId: true },
        })
      )?.partnerId ?? null;
  await tx.auditLog.create({
    data: {
      partnerId,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValue:
        entry.oldValue === undefined ? undefined : (entry.oldValue as object),
      newValue:
        entry.newValue === undefined ? undefined : (entry.newValue as object),
      ipAddress,
      userAgent,
    },
  });
}
