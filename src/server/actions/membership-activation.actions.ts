"use server";

import type { PaymentOrder } from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireVendorAccess } from "@/lib/rbac";
import { PublicActionError } from "@/lib/public-action-error";
import {
  uploadMembershipPhoto,
  deleteVendorPhoto,
  getSignedDocumentUrl,
} from "@/lib/imagekit";
import { validateUploadFile } from "@/lib/upload-limits";
import { writeAuditLog } from "@/lib/audit";
import { lookupCustomerProfiles } from "@/lib/profiles";

function assertActivatable(order: PaymentOrder, now: Date) {
  if (order.cancelledAt || !["CREATED", "CAPTURED"].includes(order.status))
    throw new PublicActionError(
      "This booking has expired or was cancelled. Create a new booking.",
    );
  if (order.paymentMethod === "ONLINE" && order.status !== "CAPTURED")
    throw new PublicActionError(
      "Online payment must be verified by the gateway first.",
    );
  if (order.status === "CREATED" && order.expiresAt <= now)
    throw new PublicActionError(
      "The payment deadline has passed. Create a new booking.",
    );
}

async function accessibleOrder(code: string) {
  await requirePermission("vendor.update");
  const value = z.string().trim().min(1).max(100).parse(code);
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT o.id FROM admin.payment_orders o WHERE o.target_id=${value}
    OR o.target_id IN(SELECT id FROM admin.bookings WHERE booking_code=${value}
      UNION ALL SELECT id FROM admin.flex_bookings WHERE booking_code=${value}
      UNION ALL SELECT id FROM admin.subscriptions WHERE 'subscription:'||id=${value}) LIMIT 1`;
  if (!rows[0]) throw new PublicActionError("Booking not found");
  const order = await prisma.paymentOrder.findUniqueOrThrow({
    where: { id: rows[0].id },
  });
  const session = await requireVendorAccess(order.vendorId, "vendor.update");
  return { order, session };
}

async function local_reviewMembershipBooking(code: string) {
  const { order } = await accessibleOrder(code);
  const profiles = await lookupCustomerProfiles([order.userId]);
  const vendor = await prisma.vendor.findUniqueOrThrow({
    where: { id: order.vendorId },
    select: { name: true, timeZone: true },
  });
  const details = await prisma.$queryRaw<
    { planName: string; slotLabel: string | null; bookingCode: string }[]
  >`
    SELECT coalesce(s.plan_name,p.name,'Booking') AS "planName",s.slot_start_time::text AS "slotLabel",'subscription:'||s.id AS "bookingCode"
    FROM admin.subscriptions s LEFT JOIN admin.membership_plans p ON p.id=s.plan_id WHERE s.id=${order.targetId}
    UNION ALL SELECT p.name,f.slot_start::text,f.booking_code FROM admin.flex_bookings f JOIN admin.membership_plans p ON p.id=f.plan_id WHERE f.id=${order.targetId}
    UNION ALL SELECT coalesce(p.name,'Booking'),coalesce(b.time_label,b.start_at::text),coalesce(b.booking_code,b.id) FROM admin.bookings b LEFT JOIN admin.membership_plans p ON p.id=b.plan_id WHERE b.id=${order.targetId}`;
  const card = await prisma.membershipCard.findUnique({
    where: { orderId: order.id },
  });
  return {
    targetId: order.targetId,
    bookingCode: details[0]?.bookingCode ?? order.targetId,
    customerName: profiles.get(order.userId)?.fullName ?? "Customer",
    vendorName: vendor.name,
    timeZone: vendor.timeZone,
    planName: details[0]?.planName ?? "Booking",
    slotLabel: details[0]?.slotLabel,
    amount: order.amountPaise / 100,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.status,
    startsAt: order.startsAt,
    expiresAt: order.expiresAt,
    activated: !!card,
    photoUrl: card ? await getSignedDocumentUrl(card.photoPath) : null,
  };
}

async function local_activateMembership(form: FormData) {
  const { order: reference, session } = await accessibleOrder(
    String(form.get("targetId") ?? ""),
  );
  if (form.get("customerVerified") !== "on")
    throw new PublicActionError("Verify the customer's identity first.");
  if (
    reference.paymentMethod === "OFFLINE" &&
    form.get("paymentReceived") !== "on"
  )
    throw new PublicActionError(
      "Confirm payment was received at the location.",
    );
  // Retry after a lost response does not require another upload.
  if (
    await prisma.membershipCard.findUnique({ where: { orderId: reference.id } })
  )
    return;
  assertActivatable(reference, new Date());
  const file = form.get("selfie");
  const validation = validateUploadFile(file, ["image/jpeg", "image/png"]);
  if (validation) throw new PublicActionError(validation);
  const bytes = new Uint8Array(await (file as File).arrayBuffer());
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  if (!((file as File).type === "image/jpeg" ? jpeg : png))
    throw new PublicActionError("Upload a valid JPG or PNG selfie.");
  const photo = await uploadMembershipPhoto(reference.id, file as File);
  let used = false;
  try {
    used = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM admin.payment_orders WHERE id=${reference.id} FOR UPDATE`;
      const order = await tx.paymentOrder.findUniqueOrThrow({
        where: { id: reference.id },
      });
      if (await tx.membershipCard.findUnique({ where: { orderId: order.id } }))
        return false;
      const now = new Date();
      assertActivatable(order, now);
      const published = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM public.published_listings WHERE id=${order.vendorId}`;
      if (!published.length)
        throw new PublicActionError(
          "This location is not currently available.",
        );
      const active = await tx.$queryRaw<
        { id: string; customerName: string }[]
      >`SELECT id,coalesce(full_name,'Customer') AS "customerName" FROM public.profiles WHERE id::text=${order.userId} AND is_active`;
      if (!active.length)
        throw new PublicActionError("Customer account is not active.");
      const paidAt = order.capturedAt ?? now;
      if (order.targetType === "subscription") {
        // Later of booked day and payment day; retain the original calendar term.
        // Updating the subscription rebuilds the reservation ledger atomically:
        // an overlap or changed opening hours rejects the entire activation.
        const updated = await tx.$executeRaw`
          UPDATE admin.subscriptions s SET
            end_date=GREATEST(s.start_date::date,(${paidAt}::timestamptz AT TIME ZONE v.time_zone)::date)+CASE WHEN ${order.membershipMonths}::integer IS NOT NULL THEN make_interval(months=>${order.membershipMonths}::integer) ELSE age(s.end_date,s.start_date) END,
            start_date=GREATEST(s.start_date::date,(${paidAt}::timestamptz AT TIME ZONE v.time_zone)::date),
            status='ACTIVE',updated_at=now()
          FROM admin.vendors v WHERE s.id=${order.targetId} AND v.id=s.vendor_id AND s.status IN('PENDING','ACTIVE')`;
        if (!updated)
          throw new PublicActionError("Subscription is no longer available.");
      } else if (order.targetType === "flex") {
        const flex = await tx.flexBooking.findUniqueOrThrow({
          where: { id: order.targetId },
        });
        if (flex.status !== "PENDING" && flex.status !== "CONFIRMED")
          throw new PublicActionError("Booking is no longer available.");
        if (flex.parentId)
          await tx.flexBooking.update({
            where: { id: order.targetId },
            data: { status: "CONFIRMED" },
          });
        else
          await tx.$executeRaw`UPDATE admin.flex_bookings f SET start_date=GREATEST(f.start_date,(${paidAt}::timestamptz AT TIME ZONE v.time_zone)::date),status='CONFIRMED',updated_at=now()
          FROM admin.vendors v WHERE f.id=${order.targetId} AND v.id=f.vendor_id`;
      } else {
        const booking = await tx.booking.findUniqueOrThrow({
          where: { id: order.targetId },
        });
        if (booking.status !== "PENDING" && booking.status !== "CONFIRMED")
          throw new PublicActionError("Booking is no longer available.");
        await tx.booking.update({
          where: { id: order.targetId },
          data: { status: "CONFIRMED" },
        });
      }
      const windows = await tx.$queryRaw<{ valid: boolean }[]>`
        SELECT admin.membership_windows_valid(${order.targetId},${order.vendorId}) AS valid`;
      if (!windows[0]?.valid)
        throw new PublicActionError(
          "No valid access windows remain, or opening hours changed. Resolve the booking before confirming payment.",
        );
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: "CAPTURED", capturedAt: paidAt },
      });
      const card = await tx.membershipCard.create({
        data: {
          id: `ZT-${randomUUID().toUpperCase()}`,
          orderId: order.id,
          customerName: active[0].customerName ?? "Customer",
          photoPath: photo.path,
          verifiedBy: session.user.id,
          verifiedAt: now,
          activatedAt: now,
        },
      });
      await tx.paymentEvent.create({
        data: {
          id: `activation:${order.id}`,
          orderId: order.id,
          kind:
            order.paymentMethod === "OFFLINE"
              ? "offline.confirmed_and_activated"
              : "membership.activated",
        },
      });
      await writeAuditLog(tx, {
        userId: session.user.id,
        action: "ACTIVATE_MEMBERSHIP",
        entityType: "membership_card",
        entityId: card.id,
        newValue: {
          vendorId: order.vendorId,
          orderId: order.id,
          paymentMethod: order.paymentMethod,
          amountPaise: order.amountPaise,
        },
      });
      await tx.customerNotification.upsert({
        where: { eventKey: `activation:${order.id}` },
        update: {},
        create: {
          userId: order.userId,
          eventKey: `activation:${order.id}`,
          title: "Membership activated",
          body: "Your verified digital membership card is now available in Memberships. Use your existing QR for entry.",
        },
      });
      return true;
    });
  } finally {
    if (!used) await deleteVendorPhoto(photo.fileId).catch(() => {});
  }
  revalidatePath("/dashboard");
  revalidatePath("/payments");
  revalidatePath("/subscriptions");
  revalidatePath("/bookings");
  revalidatePath(`/vendors/${reference.vendorId}`);
}

export async function reviewMembershipBooking(
  ...args: Parameters<typeof local_reviewMembershipBooking>
): Promise<Awaited<ReturnType<typeof local_reviewMembershipBooking>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_reviewMembershipBooking>>
    >("membership-activation.actions.reviewMembershipBooking", args);
  }
  return local_reviewMembershipBooking(...args);
}

export async function activateMembership(
  ...args: Parameters<typeof local_activateMembership>
): Promise<Awaited<ReturnType<typeof local_activateMembership>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_activateMembership>>>(
      "membership-activation.actions.activateMembership",
      args,
    );
  }
  return local_activateMembership(...args);
}
