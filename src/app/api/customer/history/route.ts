import { requireCustomer, apiFailure } from "@/lib/customer-api";
import {
  historyRequestSchema,
  readCustomerHistory,
} from "@/lib/customer-history";

export async function GET(request: Request) {
  try {
    const input = historyRequestSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const customer = await requireCustomer(request);
    return Response.json(await readCustomerHistory(customer.id, input), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
