import type { Prisma } from "@/generated/prisma/client";
// Keep aligned with public.published_listings and checkout eligibility.
export const LIVE_LISTING_WHERE = {
  status: "PUBLISHED",
  partner: { status: "ACTIVE", approvalStatus: "APPROVED" },
  category: { status: "ACTIVE", launchEnabled: true },
} satisfies Prisma.VendorWhereInput;
