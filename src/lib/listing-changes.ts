import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";

export type ListingChangeKind =
  | "PROFILE"
  | "ADDRESS"
  | "CAPACITY"
  | "SCHEDULE"
  | "FACILITIES"
  | "PLAN_CREATE"
  | "PLAN_UPDATE"
  | "PLAN_ARCHIVE"
  | "MEDIA_CREATE"
  | "MEDIA_DELETE"
  | "MEDIA_PRIMARY"
  | "SEAT_CREATE"
  | "SEAT_UPDATE"
  | "SEAT_DELETE"
  | "SEAT_ACTIVE";

export async function lockListing(
  tx: Prisma.TransactionClient,
  vendorId: string,
) {
  await tx.$queryRaw`SELECT id FROM admin.vendors WHERE id = ${vendorId} FOR UPDATE`;
  return tx.vendor.findUniqueOrThrow({ where: { id: vendorId } });
}

// The caller validates and authorizes first. Locking serializes revision creation,
// approval and publication, so a draft write cannot race past publication.
export async function queueListingChange(
  tx: Prisma.TransactionClient,
  vendorId: string,
  userId: string,
  kind: ListingChangeKind,
  targetId: string,
  payload: unknown,
): Promise<boolean> {
  const vendor = await lockListing(tx, vendorId);
  if (["SUBMITTED", "UNDER_REVIEW"].includes(vendor.status)) {
    throw new Error(
      "This listing is under review. Wait for a decision before editing it.",
    );
  }
  if (!["PUBLISHED", "APPROVED", "SUSPENDED"].includes(vendor.status))
    return false;
  const pending = await tx.listingChange.findFirst({
    where: {
      vendorId,
      targetId,
      kind: { startsWith: kind.split("_")[0] },
      status: "PENDING",
    },
  });
  if (pending)
    throw new Error("A change to this item is already awaiting Admin review.");
  const change = await tx.listingChange.create({
    data: {
      id: randomUUID(),
      vendorId,
      kind,
      targetId,
      requestedBy: userId,
      payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
    },
  });
  await writeAuditLog(tx, {
    userId,
    action: "REQUEST_LISTING_CHANGE",
    entityType: "listing_change",
    entityId: change.id,
    newValue: { vendorId, kind, targetId, payload },
  });
  return true;
}
