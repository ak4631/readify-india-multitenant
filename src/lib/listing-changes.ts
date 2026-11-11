import { listingSnapshot } from "@/lib/listing-snapshot";
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
  | "SEAT_ACTIVE"
  | import("@/lib/category-changes").CategoryChangeKind;

export class ListingChangeConflict extends Error {}

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
    throw new ListingChangeConflict(
      "This listing is under review. Wait for a decision before editing it.",
    );
  }
  if (!["PUBLISHED", "APPROVED", "SUSPENDED"].includes(vendor.status))
    return false;
  let revision = await tx.listingRevision.findFirst({
    where: { vendorId, status: { in: ["DRAFT", "PENDING"] } },
  });
  if (revision?.status === "PENDING")
    throw new ListingChangeConflict(
      "Your submitted revision is awaiting Super Admin review. Wait for a decision or withdraw it before editing.",
    );
  if (!revision)
    revision = await tx.listingRevision.create({
      data: {
        id: randomUUID(),
        vendorId,
        baseVersion: vendor.contentVersion,
        baseSnapshot: await listingSnapshot(tx, vendorId),
        requestedBy: userId,
      },
    });
  const previous = await tx.listingChange.findFirst({
    where: { revisionId: revision.id, targetId, kind },
  });
  const serialized = JSON.parse(
    JSON.stringify(payload),
  ) as Prisma.InputJsonValue;
  const change = previous
    ? await tx.listingChange.update({
        where: { id: previous.id },
        data: { payload: serialized, requestedBy: userId },
      })
    : await tx.listingChange.create({
        data: {
          id: randomUUID(),
          vendorId,
          revisionId: revision.id,
          kind,
          targetId,
          requestedBy: userId,
          status: "DRAFT",
          payload: serialized,
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
