import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";

export const AUDIT_ACTIONS = [
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

  await tx.auditLog.create({
    data: {
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
