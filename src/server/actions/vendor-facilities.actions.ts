"use server";

import {
  ListingChangeConflict,
  queueListingChange,
} from "@/lib/listing-changes";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireVendorAccess } from "@/lib/rbac";
import { vendorFacilitiesSchema } from "@/lib/validations/facility.schema";

export type FacilitiesSaveResult =
  | { ok: true; outcome: "saved" | "queued"; facilityIds: string[] }
  | { ok: false; message: string };

export async function setVendorFacilities(
  vendorId: string,
  facilityIds: string[],
): Promise<FacilitiesSaveResult> {
  const parsed = vendorFacilitiesSchema.safeParse({ vendorId, facilityIds });
  if (!parsed.success)
    return { ok: false, message: "Select valid facilities and try again." };
  ({ vendorId, facilityIds } = parsed.data);
  const session = await requireVendorAccess(vendorId, "vendor.update");

  let outcome: "saved" | "queued";
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const facilities = await tx.facility.findMany({
        where: { id: { in: facilityIds }, status: "ACTIVE" },
        select: { id: true },
      });
      if (facilities.length !== facilityIds.length) {
        throw new ListingChangeConflict(
          "Some facilities are no longer available. Reload the listing before saving.",
        );
      }
      if (
        await queueListingChange(
          tx,
          vendorId,
          session.user.id,
          "FACILITIES",
          vendorId,
          facilityIds,
        )
      )
        return "queued" as const;
      const before = await tx.vendorFacility.findMany({ where: { vendorId } });

      await tx.vendorFacility.deleteMany({ where: { vendorId } });
      if (facilityIds.length > 0) {
        await tx.vendorFacility.createMany({
          data: facilityIds.map((facilityId) => ({ vendorId, facilityId })),
          skipDuplicates: true,
        });
      }

      await writeAuditLog(tx, {
        userId: session.user.id,
        action: "UPDATE_VENDOR_FACILITIES",
        entityType: "vendor",
        entityId: vendorId,
        oldValue: { facilityIds: before.map((f) => f.facilityId) },
        newValue: { facilityIds },
      });
      return "saved" as const;
    });
  } catch (error) {
    if (error instanceof ListingChangeConflict)
      return { ok: false, message: error.message };
    throw error;
  }

  revalidatePath(`/vendors/${vendorId}`);
  return { ok: true, outcome, facilityIds };
}
