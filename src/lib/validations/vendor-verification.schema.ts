import { z } from "zod";

import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload-limits";

export const MAX_DOCUMENT_SIZE_BYTES = MAX_UPLOAD_SIZE_BYTES;
export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

export const uploadVerificationDocumentSchema = z.object({
  vendorId: z.string().min(1),
  documentType: z.enum([
    "BUSINESS_REGISTRATION",
    "GST_CERTIFICATE",
    "PAN",
    "OWNER_ID",
    "ADDRESS_PROOF",
    "TRAINER_CERTIFICATION",
    "EDUCATIONAL_DOCUMENT",
    "OTHER",
  ]),
  documentNumber: z.string().optional(),
});

export const reviewVerificationDocumentSchema = z.object({
  verificationId: z.string().min(1),
  decision: z.enum(["VERIFIED", "REJECTED"]),
  rejectionReason: z.string().optional(),
});
