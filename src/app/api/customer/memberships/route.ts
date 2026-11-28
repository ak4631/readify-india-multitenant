import { z } from "zod";
import { requireCustomer, apiFailure } from "@/lib/customer-api";
import { customerMembershipCards } from "@/lib/membership-cards";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    // Old app builds retain their existing response; new builds request pages.
    const window = params.has("limit")
      ? z
          .object({
            limit: z.coerce.number().int().min(1).max(100),
            offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
          })
          .parse(Object.fromEntries(params))
      : undefined;
    const customer = await requireCustomer(request);
    return Response.json(await customerMembershipCards(customer.id, window), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
