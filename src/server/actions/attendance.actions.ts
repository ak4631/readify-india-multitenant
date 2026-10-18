"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireVendorAccess } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

export async function checkInByCode(code: string) {
  const value = z.string().trim().min(3).max(100).parse(code);
  const references = await prisma.$queryRaw<
    { id: string; vendorId: string; userId: string }[]
  >`
    SELECT id,vendor_id AS "vendorId",user_id AS "userId" FROM admin.bookings WHERE booking_code=${value}
    UNION ALL SELECT id,vendor_id,user_id FROM admin.flex_bookings WHERE booking_code=${value}
    UNION ALL SELECT id,vendor_id,user_id FROM admin.subscriptions WHERE 'subscription:'||id=${value}`;
  const target = references[0];
  if (!target) throw new Error("Booking code not found");
  const session = await requireVendorAccess(target.vendorId, "vendor.update");
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM admin.payment_orders WHERE target_id=${target.id} FOR UPDATE`;
    const order = await tx.paymentOrder.findUnique({
      where: { targetId: target.id },
    });
    if (!order || order.status !== "CAPTURED")
      throw new Error("Payment has not been verified for this booking");
    const active = await tx.$queryRaw<{ date: string }[]>`
      SELECT (now() AT TIME ZONE v.time_zone)::date::text AS date FROM admin.seat_reservations r
      JOIN admin.library_seats s ON s.id=r.seat_id JOIN admin.vendors v ON v.id=s.vendor_id
      JOIN public.published_listings listing ON listing.id=v.id
      WHERE r.source_id=${target.id} AND r."window" @> now() LIMIT 1`;
    if (!active.length)
      throw new Error("This booking is not valid for the current time window");
    const existing = await tx.attendanceVisit.findFirst({
      where: { targetId: target.id, checkedOutAt: null },
    });
    if (existing) return;
    const visit = await tx.attendanceVisit.create({
      data: {
        vendorId: target.vendorId,
        userId: target.userId,
        targetId: target.id,
        serviceDate: new Date(active[0].date),
        admittedBy: session.user.id,
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CHECK_IN",
      entityType: "attendance",
      entityId: visit.id,
    });
  });
  revalidatePath("/customers");
  revalidatePath("/bookings");
  revalidatePath("/service-management");
}

export async function checkOutVisit(visitId: string) {
  const visit = await prisma.attendanceVisit.findUniqueOrThrow({
    where: { id: visitId },
  });
  const session = await requireVendorAccess(visit.vendorId, "vendor.update");
  await prisma.$transaction(async (tx) => {
    const result = await tx.attendanceVisit.updateMany({
      where: { id: visitId, checkedOutAt: null },
      data: { checkedOutAt: new Date(), releasedBy: session.user.id },
    });
    if (result.count)
      await writeAuditLog(tx, {
        userId: session.user.id,
        action: "CHECK_OUT",
        entityType: "attendance",
        entityId: visitId,
      });
  });
  revalidatePath("/customers");
  revalidatePath("/bookings");
  revalidatePath("/service-management");
}
