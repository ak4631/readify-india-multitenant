import { requireCustomer, apiFailure } from "@/lib/customer-api";
import { checkoutSchema, createCheckout, checkoutToken } from "@/lib/payments";
import { paymentConfig } from "@/lib/razorpay";

export async function POST(request: Request) {
  try {
    const customer = await requireCustomer(request);
    const input = checkoutSchema.parse(await request.json());
    const order = await createCheckout(customer.id, input);
    if (order.paymentMethod === "OFFLINE")
      return Response.json({
        id: order.id,
        status: order.status,
        amountPaise: order.amountPaise,
        paymentMethod: order.paymentMethod,
        expiresAt: order.expiresAt,
        checkoutUrl: "",
        razorpay: null,
      });
    const origin = process.env.CHECKOUT_BASE_URL;
    if (!origin) throw new Error("Checkout URL is not configured");
    const token = checkoutToken(order);
    return Response.json({
      id: order.id,
      paymentMethod: order.paymentMethod,
      expiresAt: order.expiresAt,
      status: order.status,
      amountPaise: order.amountPaise,
      checkoutUrl: `${origin.replace(/\/$/, "")}/checkout/${order.id}?token=${token}`,
      // In-app native checkout. The key id is public; the token is the same
      // one carried by checkoutUrl and only authorizes /api/payments/verify.
      razorpay: order.gatewayOrderId
        ? {
            keyId: paymentConfig().keyId,
            orderId: order.gatewayOrderId,
            verifyToken: token,
          }
        : null,
    });
  } catch (error) {
    return apiFailure(error);
  }
}
