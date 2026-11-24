import { requireCustomer, apiFailure } from "@/lib/customer-api";
import { dataRequestSchema, readCustomerData, publicDataTables } from "@/lib/customer-data";
export async function POST(request: Request) {
  try {
    const input = dataRequestSchema.parse(await request.json());
    const customer = request.headers.has("authorization") || !publicDataTables.has(input.table) || input.action !== "select" ? await requireCustomer(request) : null;
    return Response.json(await readCustomerData(input, customer?.id ?? null), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiFailure(error); }
}
