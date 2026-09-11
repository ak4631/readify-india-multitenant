import type { VendorStatus } from "@/generated/prisma/enums";

export const ALLOWED_TRANSITIONS: Record<VendorStatus, VendorStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PUBLISHED"],
  PUBLISHED: ["SUSPENDED"],
  REJECTED: ["DRAFT"],
  SUSPENDED: [],
};

export function canTransition(from: VendorStatus, to: VendorStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: VendorStatus, to: VendorStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid vendor status transition: ${from} -> ${to}`);
  }
}
