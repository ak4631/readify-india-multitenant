"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireVendorAccess } from "@/lib/rbac";

export async function setVendorFacilities(
  vendorId: string,
  facilityIds: string[],
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");

  await prisma.$transaction(async (tx) => {
    const before = await tx.vendorFacility.findMany({ where: { vendorId } });

    await tx.vendorFacility.deleteMany({ where: { vendorId } });
    if (facilityIds.length > 0) {
      await tx.vendorFacility.createMany({
        data: facilityIds.map((facilityId) => ({ vendorId, facilityId })),
        skipDuplicates: true,
      });
    }

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_VENDOR_FACILITIES",
      entityType: "vendor",
      entityId: vendorId,
      oldValue: { facilityIds: before.map((f) => f.facilityId) },
      newValue: { facilityIds },
    });
  });

  revalidatePath(`/vendors/${vendorId}`);
}
