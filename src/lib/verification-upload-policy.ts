import type { VendorStatus } from "@/generated/prisma/enums";

// Initial listing submissions have immutable snapshots. Private document uploads
// for an existing listing are independent of customer-facing content revisions.
export function canUploadVerificationDocuments(status: VendorStatus) {
  return status !== "SUBMITTED" && status !== "UNDER_REVIEW";
}
