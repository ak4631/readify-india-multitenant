"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  facilitySchema,
  type FacilityInput,
} from "@/lib/validations/facility.schema";

export async function listFacilities() {
  await requirePermission("facility.read");

  return prisma.facility.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { vendorFacilities: true } } },
  });
}

export async function createFacility(input: FacilityInput) {
  const session = await requirePermission("facility.create");
  const data = facilitySchema.parse(input);

  const facility = await prisma.$transaction(async (tx) => {
    const created = await tx.facility.create({ data });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_FACILITY",
      entityType: "facility",
      entityId: created.id,
      newValue: created,
    });

    return created;
  });

  revalidatePath("/facilities");
  return facility;
}

export async function updateFacility(facilityId: string, input: FacilityInput) {
  const session = await requirePermission("facility.update");
  const data = facilitySchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const before = await tx.facility.findUniqueOrThrow({
      where: { id: facilityId },
    });
    const after = await tx.facility.update({ where: { id: facilityId }, data });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_FACILITY",
      entityType: "facility",
      entityId: facilityId,
      oldValue: before,
      newValue: after,
    });
  });

  revalidatePath("/facilities");
}

// Facilities are FK'd from vendor_facilities, so "delete" is a soft-delete —
// existing vendor mappings keep working, the facility just drops off active pickers.
export async function deactivateFacility(facilityId: string) {
  const session = await requirePermission("facility.delete");

  await prisma.$transaction(async (tx) => {
    const before = await tx.facility.findUniqueOrThrow({
      where: { id: facilityId },
    });
    const after = await tx.facility.update({
      where: { id: facilityId },
      data: { status: "INACTIVE" },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "DEACTIVATE_FACILITY",
      entityType: "facility",
      entityId: facilityId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });
  });

  revalidatePath("/facilities");
}
