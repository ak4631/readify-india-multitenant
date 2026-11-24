import { requireCustomer, apiFailure } from "@/lib/customer-api";
import { prisma } from "@/lib/prisma";
import {
  bookingOtp,
  publicBookingDetails,
  readBookingDetails,
  saveBookingDetails,
} from "@/lib/booking-details";

export async function GET(request: Request) {
  try {
    const customer = await requireCustomer(request);
    return Response.json(
      publicBookingDetails(await readBookingDetails(prisma, customer.id)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiFailure(error);
  }
}
export async function PUT(request: Request) {
  try {
    const customer = await requireCustomer(request);
    return Response.json(
      await saveBookingDetails(customer.id, await request.json()),
    );
  } catch (error) {
    return apiFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const customer = await requireCustomer(request);
    return Response.json(await bookingOtp(customer.id, await request.json()));
  } catch (error) {
    return apiFailure(error);
  }
}
