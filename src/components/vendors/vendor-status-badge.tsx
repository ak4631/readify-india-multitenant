import { Badge } from "@/components/ui/badge";
import type { VendorStatus, VerificationStatus } from "@/generated/prisma/enums";

const STATUS_VARIANTS: Record<VendorStatus, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SUBMITTED: "secondary",
  UNDER_REVIEW: "secondary",
  APPROVED: "default",
  PUBLISHED: "default",
  REJECTED: "destructive",
  SUSPENDED: "destructive",
};

export function VendorStatusBadge({ status }: { status: VendorStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{status.replace("_", " ")}</Badge>;
}

const VERIFICATION_VARIANTS: Record<VerificationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  UNDER_REVIEW: "secondary",
  VERIFIED: "default",
  REJECTED: "destructive",
};

export function VerificationStatusBadge({ status }: { status: VerificationStatus }) {
  return <Badge variant={VERIFICATION_VARIANTS[status]}>{status.replace("_", " ")}</Badge>;
}
