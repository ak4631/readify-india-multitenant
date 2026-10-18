import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  expireCheckouts,
  expireSubscriptions,
  processRefund,
} from "@/lib/payments";

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !expected ||
    Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  )
    return new Response(null, { status: 401 });
  await expireCheckouts();
  await expireSubscriptions();
  await prisma.requestThrottle.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  const pending = await prisma.paymentOrder.findMany({
    where: { status: "REFUND_PENDING" },
    select: { id: true },
    take: 100,
  });
  const results = await Promise.allSettled(
    pending.map((order) => processRefund(order.id)),
  );
  const failures = results.filter(
    (result) => result.status === "rejected",
  ).length;
  return Response.json(
    { refundsChecked: pending.length, failures },
    { status: failures ? 503 : 200 },
  );
}
