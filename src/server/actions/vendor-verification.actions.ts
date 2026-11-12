"use server";
import { lockListing, ListingChangeConflict } from "@/lib/listing-changes";
import { canUploadVerificationDocuments } from "@/lib/verification-upload-policy";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireSuperAdminPermission, requireVendorAccess } from "@/lib/rbac";
import { getSignedDocumentUrl, uploadVendorDocument } from "@/lib/imagekit";
import {
  ALLOWED_DOCUMENT_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
  reviewVerificationDocumentSchema,
  uploadVerificationDocumentSchema,
} from "@/lib/validations/vendor-verification.schema";

export type VerificationUploadResult =
  { ok: true } | { ok: false; message: string };

const uploadFrozenMessage =
  "This listing's initial submission is under review. Wait for a decision before uploading another document.";

export async function uploadVerificationDocument(
  formData: FormData,
): Promise<VerificationUploadResult> {
  const parsed = uploadVerificationDocumentSchema.safeParse({
    vendorId: formData.get("vendorId"),
    documentType: formData.get("documentType"),
    documentNumber: formData.get("documentNumber") || undefined,
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message };
  const input = parsed.data;
  const session = await requireVendorAccess(
    input.vendorId,
    "verification.upload",
  );
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, message: "A file is required" };
  if (file.size > MAX_DOCUMENT_SIZE_BYTES)
    return { ok: false, message: "File exceeds the 5MB limit" };
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type))
    return { ok: false, message: "Only PDF, JPG, and PNG files are allowed" };

  const listing = await prisma.vendor.findUniqueOrThrow({
    where: { id: input.vendorId },
    select: { status: true },
  });
  if (!canUploadVerificationDocuments(listing.status))
    return { ok: false, message: uploadFrozenMessage };

  const documentUrl = await uploadVendorDocument(
    input.vendorId,
    file,
    input.documentType,
  );
  try {
    await prisma.$transaction(async (tx) => {
      const vendor = await lockListing(tx, input.vendorId);
      if (!canUploadVerificationDocuments(vendor.status))
        throw new ListingChangeConflict(uploadFrozenMessage);
      // Store private evidence immediately so a Super Admin can verify it before
      // approving a content revision. Uploads never auto-verify documents.
      const verification = await tx.vendorVerification.create({
        data: {
          vendorId: input.vendorId,
          documentType: input.documentType,
          documentNumber: input.documentNumber,
          documentUrl,
          status: "PENDING",
        },
      });
      await writeAuditLog(tx, {
        userId: session.user.id,
        partnerId: vendor.partnerId,
        action: "UPLOAD_VERIFICATION_DOCUMENT",
        entityType: "vendor_verification",
        entityId: verification.id,
        newValue: verification,
      });
    });
  } catch (error) {
    if (error instanceof ListingChangeConflict)
      return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath(`/vendors/${input.vendorId}`);
  revalidatePath("/approvals");
  return { ok: true };
}

export async function reviewVerificationDocument(input: {
  verificationId: string;
  decision: "VERIFIED" | "REJECTED";
  rejectionReason?: string;
}) {
  const session = await requireSuperAdminPermission("verification.review");
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
