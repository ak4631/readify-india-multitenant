"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { lockListing } from "@/lib/listing-changes";
import { requirePlatformPermission, requireVendorAccess } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { membershipPlanSchema } from "@/lib/validations/membership-plan.schema";
import {
  vendorAddressSchema,
  vendorBasicInfoSchema,
} from "@/lib/validations/vendor.schema";
import { vendorScheduleSchema } from "@/lib/validations/vendor-schedule.schema";
import { vendorCapacitySchema } from "@/lib/validations/vendor-capacity.schema";
import { librarySeatTypeSchema } from "@/lib/validations/library-seat-type.schema";

export async function listListingChanges(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  return prisma.listingChange.findMany({
    where: { vendorId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function reviewListingChange(
  changeId: string,
  approve: boolean,
  reason?: string,
) {
  const session = await requirePlatformPermission(
    approve ? "vendor.approve" : "vendor.reject",
  );
  const rejectionReason = approve
    ? null
    : z.string().trim().min(3).max(1000).parse(reason);
  const reference = await prisma.listingChange.findUniqueOrThrow({
    where: { id: changeId },
  });
  await prisma.$transaction(async (tx) => {
    const vendor = await lockListing(tx, reference.vendorId);
    const change = await tx.listingChange.findUniqueOrThrow({
      where: { id: changeId },
    });
    if (change.status !== "PENDING")
      throw new Error("This change has already been reviewed.");
    if (
      approve &&
      !["PUBLISHED", "APPROVED", "SUSPENDED"].includes(vendor.status)
    ) {
      throw new Error(
        "Review the listing's current status before applying changes.",
      );
    }
    if (approve) {
      const target = { id: change.targetId, vendorId: change.vendorId };
      switch (change.kind) {
        case "PROFILE": {
          const { partnerId: _partnerId, ...data } =
            vendorBasicInfoSchema.parse(change.payload);
          void _partnerId;
          await tx.vendor.update({ where: { id: change.vendorId }, data });
          break;
        }
        case "ADDRESS": {
          const data = vendorAddressSchema.parse(change.payload);
          await tx.vendorAddress.upsert({
            where: { vendorId: change.vendorId },
            create: { ...data, vendorId: change.vendorId },
            update: data,
          });
          break;
        }
        case "CAPACITY":
          await tx.vendor.update({
            where: { id: change.vendorId },
            data: vendorCapacitySchema.parse(change.payload),
          });
          break;
        case "SCHEDULE":
          for (const day of vendorScheduleSchema.parse(change.payload).days) {
            const data = {
              isClosed: day.isClosed,
              openTime: new Date(`1970-01-01T${day.openTime}:00Z`),
              closeTime: new Date(`1970-01-01T${day.closeTime}:00Z`),
            };
            await tx.vendorSchedule.upsert({
              where: {
                vendorId_dayOfWeek: {
                  vendorId: change.vendorId,
                  dayOfWeek: day.dayOfWeek,
                },
              },
              create: {
                ...data,
                vendorId: change.vendorId,
                dayOfWeek: day.dayOfWeek,
              },
              update: data,
            });
          }
          {
            const check = await tx.$queryRaw<
              { fits: boolean }[]
            >`SELECT admin.reservations_fit_schedule(${change.vendorId}) AS fits`;
            if (!check[0]?.fits)
              throw new Error(
                "These hours conflict with existing reservations. Cancel and refund affected purchases before changing the schedule.",
              );
          }
          break;
        case "FACILITIES": {
          const ids = z.array(z.string().min(1)).max(100).parse(change.payload);
          await tx.vendorFacility.deleteMany({
            where: { vendorId: change.vendorId },
          });
          if (ids.length)
            await tx.vendorFacility.createMany({
              data: ids.map((facilityId) => ({
                vendorId: change.vendorId,
                facilityId,
              })),
              skipDuplicates: true,
            });
          break;
        }
        case "PLAN_CREATE":
          await tx.membershipPlan.create({
            data: {
              ...membershipPlanSchema.parse(change.payload),
              id: change.targetId,
              vendorId: change.vendorId,
            },
          });
          break;
        case "PLAN_UPDATE":
          await tx.membershipPlan.update({
            where: target,
            data: membershipPlanSchema.parse(change.payload),
          });
          break;
        case "PLAN_ARCHIVE":
          await tx.membershipPlan.update({
            where: target,
            data: { status: "ARCHIVED" },
          });
          break;
        case "SEAT_CREATE":
          await tx.librarySeatType.create({
            data: {
              ...librarySeatTypeSchema.parse(change.payload),
              id: change.targetId,
              vendorId: change.vendorId,
            },
          });
          break;
        case "SEAT_UPDATE":
          await tx.librarySeatType.update({
            where: target,
            data: librarySeatTypeSchema.parse(change.payload),
          });
          break;
        case "SEAT_DELETE":
          await tx.librarySeatType.delete({ where: target });
          break;
        case "MEDIA_CREATE": {
          const data = z
            .object({ mediaUrl: z.url(), externalId: z.string().min(1) })
            .parse(change.payload);
          const count = await tx.vendorMedia.count({
            where: { vendorId: change.vendorId },
          });
          await tx.vendorMedia.create({
            data: {
              ...data,
              ...target,
              isPrimary: count === 0,
              sortOrder: count,
            },
          });
          break;
        }
        case "MEDIA_DELETE":
          await tx.vendorMedia.delete({ where: target });
          break;
        case "MEDIA_PRIMARY":
          await tx.vendorMedia.findUniqueOrThrow({ where: target });
          await tx.vendorMedia.updateMany({
            where: { vendorId: change.vendorId },
            data: { isPrimary: false },
          });
          await tx.vendorMedia.update({
            where: target,
            data: { isPrimary: true },
          });
          break;
        case "SEAT_ACTIVE": {
          const data = z
            .object({ isActive: z.boolean() })
            .parse(change.payload);
          if (!data.isActive) {
            const occupied = await tx.$queryRaw<
              { busy: boolean }[]
            >`SELECT EXISTS(SELECT 1 FROM admin.seat_busy_intervals(${change.targetId}, now(), now() + interval '100 years')) AS busy`;
            if (occupied[0]?.busy)
              throw new Error(
                "This seat has reservations. Cancel them before deactivating it.",
              );
          }
          await tx.librarySeat.update({ where: target, data });
          break;
        }
        default:
          throw new Error("Unsupported change type. No changes were applied.");
      }
    }
    await tx.listingChange.update({
      where: { id: change.id },
      data: {
        status: approve ? "APPROVED" : "REJECTED",
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        reason: rejectionReason,
      },
    });
    await tx.portalNotification.create({
      data: {
        userId: change.requestedBy,
        title: approve ? "Listing change approved" : "Listing change rejected",
        body: `${vendor.name}: ${change.kind.toLowerCase().replaceAll("_", " ")}${rejectionReason ? `. ${rejectionReason}` : ""}`,
        href: `/vendors/${change.vendorId}?tab=changes`,
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: approve ? "APPROVE_LISTING_CHANGE" : "REJECT_LISTING_CHANGE",
      entityType: "listing_change",
      entityId: change.id,
      newValue: {
        status: approve ? "APPROVED" : "REJECTED",
        reason: rejectionReason,
      },
    });
  });
  revalidatePath(`/vendors/${reference.vendorId}`);
  revalidatePath("/vendors");
  revalidatePath("/notifications");
}
