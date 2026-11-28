import { prisma } from "@/lib/prisma";
import { requireCustomer, apiFailure } from "@/lib/customer-api";
import {
  cancelPaidPurchase,
  expireCheckouts,
  recordCapture,
} from "@/lib/payments";
import { razorpay, type GatewayPayment } from "@/lib/razorpay";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const customer = await requireCustomer(request);
    const { id } = await params;
    const initial = await prisma.paymentOrder.findUniqueOrThrow({
      where: { id, userId: customer.id },
      select: { status: true, gatewayOrderId: true },
    });
    if (initial.status === "CREATED" && initial.gatewayOrderId) {
      const payments = await razorpay<{ items: GatewayPayment[] }>(
        `orders/${encodeURIComponent(initial.gatewayOrderId)}/payments`,
      );
      const captured = payments.items.find(
        (payment) => payment.status === "captured",
      );
      if (captured) await recordCapture(captured, `verify:${captured.id}`);
    }
    // Polling one order must not process up to 100 unrelated expired holds.
    await expireCheckouts(id);
    const order = await prisma.paymentOrder.findUniqueOrThrow({
      where: { id, userId: customer.id },
      select: {
        id: true,
        targetId: true,
        targetType: true,
        vendorId: true,
        status: true,
        paymentMethod: true,
        expiresAt: true,
        amountPaise: true,
        startsAt: true,
      },
    });
    const seat = await prisma.$queryRaw<
      { seatNumber: string | null; bookingCode: string | null }[]
    >`
      SELECT s.label AS "seatNumber", b.booking_code AS "bookingCode" FROM admin.bookings b LEFT JOIN admin.library_seats s ON s.id=b.seat_id WHERE b.id=${order.targetId} AND ${order.targetType}='visit'
      UNION ALL SELECT s.label, f.booking_code FROM admin.flex_bookings f JOIN admin.library_seats s ON s.id=f.seat_id WHERE f.id=${order.targetId} AND ${order.targetType}='flex'
      UNION ALL SELECT s.label, 'subscription:'||sub.id FROM admin.subscriptions sub LEFT JOIN admin.library_seats s ON s.id=sub.seat_id WHERE sub.id=${order.targetId} AND ${order.targetType}='subscription'`;
    const vendor = await prisma.vendor.findUniqueOrThrow({
      where: { id: order.vendorId },
      select: { timeZone: true },
    });
    return Response.json({
      id: order.id,
      paymentMethod: order.paymentMethod,
      expiresAt: order.expiresAt,
      targetId: order.targetId,
      status: order.status,
      amountPaise: order.amountPaise,
      startsAt: order.startsAt.toISOString(),
      timeZone: vendor.timeZone,
      ...seat[0],
    });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const customer = await requireCustomer(request);
    // The cancellation URL accepts the entitlement id used by My Bookings.
    const { id } = await params;
    await cancelPaidPurchase(id, { userId: customer.id, kind: "customer" });
    return Response.json({ ok: true });
  } catch (error) {
    return apiFailure(error);
  }
}
