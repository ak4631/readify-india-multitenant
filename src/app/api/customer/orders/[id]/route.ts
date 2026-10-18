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
    let order = await prisma.paymentOrder.findUniqueOrThrow({
      where: { id, userId: customer.id },
    });
    if (order.status === "CREATED" && order.gatewayOrderId) {
      const payments = await razorpay<{ items: GatewayPayment[] }>(
        `orders/${encodeURIComponent(order.gatewayOrderId)}/payments`,
      );
      const captured = payments.items.find(
        (payment) => payment.status === "captured",
      );
      if (captured) await recordCapture(captured, `verify:${captured.id}`);
    }
    await expireCheckouts();
    order = await prisma.paymentOrder.findUniqueOrThrow({
      where: { id, userId: customer.id },
    });
    const seat = await prisma.$queryRaw<
      { seatNumber: string | null; bookingCode: string | null }[]
    >`
      SELECT s.label AS "seatNumber", b.booking_code AS "bookingCode" FROM admin.bookings b LEFT JOIN admin.library_seats s ON s.id=b.seat_id WHERE b.id=${order.targetId} AND ${order.targetType}='visit'
      UNION ALL SELECT s.label, f.booking_code FROM admin.flex_bookings f JOIN admin.library_seats s ON s.id=f.seat_id WHERE f.id=${order.targetId} AND ${order.targetType}='flex'
      UNION ALL SELECT s.label, NULL::text FROM admin.subscriptions sub LEFT JOIN admin.library_seats s ON s.id=sub.seat_id WHERE sub.id=${order.targetId} AND ${order.targetType}='subscription'`;
    const vendor = await prisma.vendor.findUniqueOrThrow({
      where: { id: order.vendorId },
      select: { timeZone: true },
    });
    return Response.json({
      id: order.id,
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
