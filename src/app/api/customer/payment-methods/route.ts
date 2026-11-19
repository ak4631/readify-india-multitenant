import { requireCustomer, apiFailure } from "@/lib/customer-api";
import { getPaymentSettings } from "@/lib/payment-settings";
export async function GET(request: Request) {
  try {
    await requireCustomer(request);
    return Response.json(await getPaymentSettings(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
