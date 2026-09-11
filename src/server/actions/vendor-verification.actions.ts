"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireVendorAccess } from "@/lib/rbac";
import { getSignedDocumentUrl, uploadVendorDocument } from "@/lib/imagekit";
import {
  ALLOWED_DOCUMENT_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
  reviewVerificationDocumentSchema,
  uploadVerificationDocumentSchema,
} from "@/lib/validations/vendor-verification.schema";

export async function uploadVerificationDocument(formData: FormData) {
  const input = uploadVerificationDocumentSchema.parse({
    vendorId: formData.get("vendorId"),
    documentType: formData.get("documentType"),
    documentNumber: formData.get("documentNumber") || undefined,
  });
  const session = await requireVendorAccess(
    input.vendorId,
    "verification.upload",
  );

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("A file is required");
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error("File exceeds the 5MB limit");
  }
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    throw new Error("Only PDF, JPG, and PNG files are allowed");
  }

  const documentUrl = await uploadVendorDocument(
    input.vendorId,
    file,
    input.documentType,
  );

  await prisma.$transaction(async (tx) => {
    const verification = await tx.vendorVerification.create({
      data: {
        vendorId: input.vendorId,
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        documentUrl,
      },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPLOAD_VERIFICATION_DOCUMENT",
      entityType: "vendor_verification",
      entityId: verification.id,
      newValue: verification,
    });
  });

  revalidatePath(`/vendors/${input.vendorId}`);
}

export async function reviewVerificationDocument(input: {
  verificationId: string;
  decision: "VERIFIED" | "REJECTED";
  rejectionReason?: string;
}) {
  const session = await requirePermission("verification.review");
  const data = reviewVerificationDocumentSchema.parse(input);

  const vendorId = await prisma.$transaction(async (tx) => {
    const before = await tx.vendorVerification.findUniqueOrThrow({
      where: { id: data.verificationId },
    });

    const after = await tx.vendorVerification.update({
      where: { id: data.verificationId },
      data: {
        status: data.decision,
        verifiedById: session.user.id,
        verifiedAt: new Date(),
        rejectionReason:
          data.decision === "REJECTED" ? data.rejectionReason : null,
      },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action:
        data.decision === "VERIFIED"
          ? "APPROVE_VERIFICATION"
          : "REJECT_VERIFICATION",
      entityType: "vendor_verification",
      entityId: after.id,
      oldValue: { status: before.status },
      newValue: {
        status: after.status,
        rejectionReason: after.rejectionReason,
      },
    });

    return after.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function getVerificationDocumentUrl(verificationId: string) {
  const verification = await prisma.vendorVerification.findUniqueOrThrow({
    where: { id: verificationId },
    select: { vendorId: true, documentUrl: true },
  });
  await requireVendorAccess(verification.vendorId, "verification.read");
  return getSignedDocumentUrl(verification.documentUrl);
}
