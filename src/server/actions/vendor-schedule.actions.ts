"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireVendorAccess } from "@/lib/rbac";
import {
  vendorScheduleSchema,
  type VendorScheduleInput,
} from "@/lib/validations/vendor-schedule.schema";

function toTime(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

export async function getVendorSchedule(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  return prisma.vendorSchedule.findMany({ where: { vendorId } });
}

export async function updateVendorSchedule(
  vendorId: string,
  input: VendorScheduleInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = vendorScheduleSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const before = await tx.vendorSchedule.findMany({ where: { vendorId } });

    for (const day of data.days) {
      await tx.vendorSchedule.upsert({
        where: { vendorId_dayOfWeek: { vendorId, dayOfWeek: day.dayOfWeek } },
        update: {
          isClosed: day.isClosed,
          openTime: toTime(day.openTime),
          closeTime: toTime(day.closeTime),
        },
        create: {
          vendorId,
          dayOfWeek: day.dayOfWeek,
          isClosed: day.isClosed,
          openTime: toTime(day.openTime),
          closeTime: toTime(day.closeTime),
        },
      });
    }

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_VENDOR_SCHEDULE",
      entityType: "vendor_schedule",
      entityId: vendorId,
      oldValue: before,
      newValue: data.days,
    });
  });

  revalidatePath(`/vendors/${vendorId}`);
}
