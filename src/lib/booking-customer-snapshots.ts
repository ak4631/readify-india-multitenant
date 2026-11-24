import "server-only";
import { prisma } from "@/lib/prisma";
export type BookingCustomerSnapshot = {
  fullName: string;
  phone: string;
  education: string;
  purpose: string;
  requirements: string;
  verificationMethod: string;
};
// Call only with target IDs obtained from an already tenant-authorized query.
export async function lookupBookingCustomerSnapshots(targetIds: string[]) {
  if (!targetIds.length) return new Map<string, BookingCustomerSnapshot>();
  const rows = await prisma.$queryRaw<
    (BookingCustomerSnapshot & { targetId: string })[]
  >`
    SELECT target_id AS "targetId",full_name AS "fullName",phone,education,purpose,requirements,verification_method AS "verificationMethod"
    FROM admin.booking_customer_snapshots WHERE target_id=ANY(${targetIds}::text[])`;
  return new Map(rows.map((row) => [row.targetId, row]));
}
