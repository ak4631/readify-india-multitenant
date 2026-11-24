import { z } from "zod";
import { requireCustomer, apiFailure } from "@/lib/customer-api";
import { callCustomerRpc, publicCustomerRpcs } from "@/lib/customer-data";
export async function POST(request: Request) {
  try {
    const input = z.object({ name: z.string().max(100), args: z.record(z.string(), z.unknown()).default({}) }).strict().parse(await request.json());
    const customer = request.headers.has("authorization") || !publicCustomerRpcs.has(input.name) ? await requireCustomer(request) : null;
    return Response.json(await callCustomerRpc(input.name, input.args, customer?.id ?? null), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiFailure(error); }
}
