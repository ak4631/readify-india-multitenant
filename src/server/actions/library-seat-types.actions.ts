"use server";

import {
  editorChanges,
  overlayRows,
  proposedParent,
} from "@/lib/listing-editor";
import { randomUUID } from "node:crypto";
import { queueListingChange } from "@/lib/listing-changes";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireVendorAccess } from "@/lib/rbac";
import {
  librarySeatTypeSchema,
  type LibrarySeatTypeInput,
} from "@/lib/validations/library-seat-type.schema";

async function local_listLibrarySeatTypes(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  const rows = await prisma.librarySeatType.findMany({
    where: { vendorId },
    orderBy: { name: "asc" },
  });
  return overlayRows(rows, await editorChanges(vendorId), "SEAT", {
    vendorId,
    name: "",
    totalCount: 1,
  });
}

async function local_createLibrarySeatType(
  vendorId: string,
  input: LibrarySeatTypeInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = librarySeatTypeSchema.parse(input);

  const seatType = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "SEAT_CREATE",
        randomUUID(),
        data,
      )
    )
      return;
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

async function local_updateLibrarySeatType(
  seatTypeId: string,
  input: LibrarySeatTypeInput,
) {
  const seatTypeRecord =
    (await prisma.librarySeatType.findUnique({ where: { id: seatTypeId } })) ??
    (await proposedParent(seatTypeId, "SEAT_CREATE"));
  const session = await requireVendorAccess(
    seatTypeRecord.vendorId,
    "vendor.update",
  );
  const data = librarySeatTypeSchema.parse(input);

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        seatTypeRecord.vendorId,
        session.user.id,
        "SEAT_UPDATE",
        seatTypeId,
        data,
      )
    )
      return seatTypeRecord.vendorId;
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

async function local_deleteLibrarySeatType(seatTypeId: string) {
  const seatTypeRecord =
    (await prisma.librarySeatType.findUnique({ where: { id: seatTypeId } })) ??
    (await proposedParent(seatTypeId, "SEAT_CREATE"));
  const session = await requireVendorAccess(
    seatTypeRecord.vendorId,
    "vendor.update",
  );

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        seatTypeRecord.vendorId,
        session.user.id,
        "SEAT_DELETE",
        seatTypeId,
        {},
      )
    )
      return seatTypeRecord.vendorId;
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

export async function listLibrarySeatTypes(
  ...args: Parameters<typeof local_listLibrarySeatTypes>
): Promise<Awaited<ReturnType<typeof local_listLibrarySeatTypes>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listLibrarySeatTypes>>>(
      "library-seat-types.actions.listLibrarySeatTypes",
      args,
    );
  }
  return local_listLibrarySeatTypes(...args);
}

export async function createLibrarySeatType(
  ...args: Parameters<typeof local_createLibrarySeatType>
): Promise<Awaited<ReturnType<typeof local_createLibrarySeatType>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_createLibrarySeatType>>>(
      "library-seat-types.actions.createLibrarySeatType",
      args,
    );
  }
  return local_createLibrarySeatType(...args);
}

export async function updateLibrarySeatType(
  ...args: Parameters<typeof local_updateLibrarySeatType>
): Promise<Awaited<ReturnType<typeof local_updateLibrarySeatType>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_updateLibrarySeatType>>>(
      "library-seat-types.actions.updateLibrarySeatType",
      args,
    );
  }
  return local_updateLibrarySeatType(...args);
}

export async function deleteLibrarySeatType(
  ...args: Parameters<typeof local_deleteLibrarySeatType>
): Promise<Awaited<ReturnType<typeof local_deleteLibrarySeatType>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_deleteLibrarySeatType>>>(
      "library-seat-types.actions.deleteLibrarySeatType",
      args,
    );
  }
  return local_deleteLibrarySeatType(...args);
}
