import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCheckoutToken, recordCapture } from "@/lib/payments";
import { validSignature } from "@/lib/payment-policy";
import { paymentConfig, razorpay, type GatewayPayment } from "@/lib/razorpay";
import { apiFailure } from "@/lib/customer-api";

export async function POST(request: Request) {
  try {
    const input = z
      .object({
        id: z.uuid(),
        token: z.string(),
        razorpay_order_id: z.string(),
        razorpay_payment_id: z.string(),
        razorpay_signature: z.string(),
      })
      .parse(await request.json());
    const order = await prisma.paymentOrder.findUniqueOrThrow({
      where: { id: input.id },
    });
    assertCheckoutToken(order, input.token);
    if (
      order.gatewayOrderId !== input.razorpay_order_id ||
      !validSignature(
        `${order.gatewayOrderId}|${input.razorpay_payment_id}`,
        input.razorpay_signature,
        paymentConfig().keySecret,
      )
    ) {
      return Response.json(
        { error: "Payment signature rejected" },
        { status: 400 },
      );
    }
    const payment = await razorpay<GatewayPayment>(
      `payments/${encodeURIComponent(input.razorpay_payment_id)}`,
    );
    await recordCapture(payment, `verify:${payment.id}`);
    return Response.json({ ok: true });
  } catch (error) {
    return apiFailure(error);
  }
}
