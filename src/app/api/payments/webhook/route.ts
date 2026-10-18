import { z } from "zod";
import { recordCapture } from "@/lib/payments";
import { validSignature } from "@/lib/payment-policy";

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret)
    return Response.json(
      { error: "Webhook is not configured" },
      { status: 503 },
    );
  const raw = await request.text();
  if (
    !validSignature(
      raw,
      request.headers.get("x-razorpay-signature") ?? "",
      secret,
    )
  )
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  try {
    const event = z
      .object({ event: z.string(), payload: z.unknown() })
      .parse(JSON.parse(raw));
    if (event.event === "payment.captured") {
      const payload = z
        .object({
          payment: z.object({
            entity: z.object({
              id: z.string(),
              order_id: z.string(),
              status: z.string(),
              amount: z.number().int(),
              currency: z.string(),
            }),
          }),
        })
        .parse(event.payload);
      const id = request.headers.get("x-razorpay-event-id");
      if (!id)
        return Response.json({ error: "Missing event id" }, { status: 400 });
      await recordCapture(payload.payment.entity, `webhook:${id}`);
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Event processing failed; retry required" },
      { status: 500 },
    );
  }
}
