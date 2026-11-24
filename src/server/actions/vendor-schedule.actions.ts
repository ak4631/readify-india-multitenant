"use server";

import { editorChanges } from "@/lib/listing-editor";
import { queueListingChange } from "@/lib/listing-changes";
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

async function local_getVendorSchedule(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  const rows = await prisma.vendorSchedule.findMany({ where: { vendorId } });
  const proposed = (await editorChanges(vendorId)).find(
    (c) => c.kind === "SCHEDULE",
  );
  if (!proposed) return rows;
  return vendorScheduleSchema.parse(proposed.payload).days.map((day) => ({
    id: vendorId + day.dayOfWeek,
    vendorId,
    dayOfWeek: day.dayOfWeek,
    isClosed: day.isClosed,
    openTime: toTime(day.openTime),
    closeTime: toTime(day.closeTime),
  }));
}

async function local_updateVendorSchedule(
  vendorId: string,
  input: VendorScheduleInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = vendorScheduleSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "SCHEDULE",
        vendorId,
        data,
      )
    )
      return;
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

export async function getVendorSchedule(
  ...args: Parameters<typeof local_getVendorSchedule>
): Promise<Awaited<ReturnType<typeof local_getVendorSchedule>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getVendorSchedule>>>(
      "vendor-schedule.actions.getVendorSchedule",
      args,
    );
  }
  return local_getVendorSchedule(...args);
}

export async function updateVendorSchedule(
  ...args: Parameters<typeof local_updateVendorSchedule>
): Promise<Awaited<ReturnType<typeof local_updateVendorSchedule>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_updateVendorSchedule>>>(
      "vendor-schedule.actions.updateVendorSchedule",
      args,
    );
  }
  return local_updateVendorSchedule(...args);
}
