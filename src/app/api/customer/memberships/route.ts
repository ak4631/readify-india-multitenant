import { requireCustomer, apiFailure } from "@/lib/customer-api";
import { customerMembershipCards } from "@/lib/membership-cards";
export async function GET(request: Request) {
  try {
    const customer = await requireCustomer(request);
    return Response.json(await customerMembershipCards(customer.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
