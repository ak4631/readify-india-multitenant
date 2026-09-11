"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireVendorAccess } from "@/lib/rbac";
import { deleteVendorPhoto, uploadVendorPhoto } from "@/lib/imagekit";

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadVendorMedia(formData: FormData) {
  const vendorId = formData.get("vendorId");
  const file = formData.get("file");

  if (typeof vendorId !== "string" || !vendorId) {
    throw new Error("vendorId is required");
  }
  const session = await requireVendorAccess(vendorId, "vendor.update");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("A file is required");
  }
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    throw new Error("File exceeds the 5MB limit");
  }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    throw new Error("Only JPG, PNG, and WEBP files are allowed");
  }

  const { url: mediaUrl, fileId } = await uploadVendorPhoto(vendorId, file);

  await prisma.$transaction(async (tx) => {
    const existingCount = await tx.vendorMedia.count({ where: { vendorId } });

    const media = await tx.vendorMedia.create({
      data: {
        vendorId,
        mediaUrl,
        externalId: fileId,
        isPrimary: existingCount === 0,
        sortOrder: existingCount,
      },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPLOAD_VENDOR_MEDIA",
      entityType: "vendor_media",
      entityId: media.id,
      newValue: media,
    });
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function deleteVendorMedia(mediaId: string) {
  const mediaRecord = await prisma.vendorMedia.findUniqueOrThrow({
    where: { id: mediaId },
  });
  const session = await requireVendorAccess(
    mediaRecord.vendorId,
    "vendor.update",
  );

  const deleted = await prisma.$transaction(async (tx) => {
    const media = await tx.vendorMedia.findUniqueOrThrow({
      where: { id: mediaId },
    });
    await tx.vendorMedia.delete({ where: { id: mediaId } });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "DELETE_VENDOR_MEDIA",
      entityType: "vendor_media",
      entityId: mediaId,
      oldValue: media,
    });

    return media;
  });

  if (deleted.externalId) {
    await deleteVendorPhoto(deleted.externalId).catch(() => {});
  }

  revalidatePath(`/vendors/${deleted.vendorId}`);
}

export async function setPrimaryVendorMedia(mediaId: string) {
  const mediaRecord = await prisma.vendorMedia.findUniqueOrThrow({
    where: { id: mediaId },
  });
  const session = await requireVendorAccess(
    mediaRecord.vendorId,
    "vendor.update",
  );

  const vendorId = await prisma.$transaction(async (tx) => {
    const media = await tx.vendorMedia.findUniqueOrThrow({
      where: { id: mediaId },
    });

    await tx.vendorMedia.updateMany({
      where: { vendorId: media.vendorId },
      data: { isPrimary: false },
    });
    await tx.vendorMedia.update({
      where: { id: mediaId },
      data: { isPrimary: true },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "SET_PRIMARY_VENDOR_MEDIA",
      entityType: "vendor_media",
      entityId: mediaId,
    });

    return media.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}
