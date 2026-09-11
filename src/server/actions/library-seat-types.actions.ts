"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireVendorAccess } from "@/lib/rbac";
import {
  librarySeatTypeSchema,
  type LibrarySeatTypeInput,
} from "@/lib/validations/library-seat-type.schema";

export async function listLibrarySeatTypes(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  return prisma.librarySeatType.findMany({
    where: { vendorId },
    orderBy: { name: "asc" },
  });
}

export async function createLibrarySeatType(
  vendorId: string,
  input: LibrarySeatTypeInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = librarySeatTypeSchema.parse(input);

  const seatType = await prisma.$transaction(async (tx) => {
    const created = await tx.librarySeatType.create({
      data: { ...data, vendorId },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_LIBRARY_SEAT_TYPE",
      entityType: "library_seat_type",
      entityId: created.id,
      newValue: created,
    });

    return created;
  });

  revalidatePath(`/vendors/${vendorId}`);
  return seatType;
}

export async function updateLibrarySeatType(
  seatTypeId: string,
  input: LibrarySeatTypeInput,
) {
  const seatTypeRecord = await prisma.librarySeatType.findUniqueOrThrow({
    where: { id: seatTypeId },
  });
  const session = await requireVendorAccess(
    seatTypeRecord.vendorId,
    "vendor.update",
  );
  const data = librarySeatTypeSchema.parse(input);

  const vendorId = await prisma.$transaction(async (tx) => {
    const before = await tx.librarySeatType.findUniqueOrThrow({
      where: { id: seatTypeId },
    });
    const after = await tx.librarySeatType.update({
      where: { id: seatTypeId },
      data,
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_LIBRARY_SEAT_TYPE",
      entityType: "library_seat_type",
      entityId: seatTypeId,
      oldValue: before,
      newValue: after,
    });

    return after.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function deleteLibrarySeatType(seatTypeId: string) {
  const seatTypeRecord = await prisma.librarySeatType.findUniqueOrThrow({
    where: { id: seatTypeId },
  });
  const session = await requireVendorAccess(
    seatTypeRecord.vendorId,
    "vendor.update",
  );

  const vendorId = await prisma.$transaction(async (tx) => {
    const before = await tx.librarySeatType.findUniqueOrThrow({
      where: { id: seatTypeId },
    });
    await tx.librarySeatType.delete({ where: { id: seatTypeId } });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "DELETE_LIBRARY_SEAT_TYPE",
      entityType: "library_seat_type",
      entityId: seatTypeId,
      oldValue: before,
    });

    return before.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}
