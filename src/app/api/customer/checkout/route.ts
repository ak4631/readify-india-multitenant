import { requireCustomer, apiFailure } from "@/lib/customer-api";
import { checkoutSchema, createCheckout, checkoutToken } from "@/lib/payments";

export async function POST(request: Request) {
  try {
    const customer = await requireCustomer(request);
    const input = checkoutSchema.parse(await request.json());
    const order = await createCheckout(customer.id, input);
    const origin = process.env.CHECKOUT_BASE_URL;
    if (!origin) throw new Error("Checkout URL is not configured");
    return Response.json({
      id: order.id,
      status: order.status,
      amountPaise: order.amountPaise,
      checkoutUrl: `${origin.replace(/\/$/, "")}/checkout/${order.id}?token=${checkoutToken(order)}`,
    });
  } catch (error) {
    return apiFailure(error);
  }
}
