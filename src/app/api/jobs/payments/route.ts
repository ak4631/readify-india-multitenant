import { timingSafeEqual } from "node:crypto";
import { deliverCustomerPushes } from "@/lib/push-delivery";
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
  const reminders = await prisma.$queryRaw<
    { count: number }[]
  >`SELECT admin.enqueue_booking_reminders() AS count`;
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
  const marketing = await prisma.$queryRaw<
    { count: number }[]
  >`SELECT admin.enqueue_marketing_campaigns() AS count`;
  const push = await deliverCustomerPushes();
  return Response.json(
    {
      push,
      marketingRecipientsQueued: marketing[0]?.count ?? 0,
      refundsChecked: pending.length,
      failures,
      remindersQueued: reminders[0]?.count ?? 0,
    },
    { status: failures || push.failed ? 503 : 200 },
  );
}
