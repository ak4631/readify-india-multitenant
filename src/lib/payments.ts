import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PaymentOrder, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { paymentConfig, razorpay, type GatewayPayment } from "@/lib/razorpay";
import {
  captureDisposition,
  refundEligible,
  validSignature,
} from "@/lib/payment-policy";

const purchaseFields = {
  vendorId: z.string().min(1).max(100),
  planId: z.string().min(1).max(100),
  date: z.iso.date(),
  idempotencyKey: z.uuid(),
};
export const checkoutSchema = z.discriminatedUnion("kind", [
  z.object({
    ...purchaseFields,
    kind: z.literal("flex"),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    days: z.number().int().min(1).max(14),
  }),
  z.object({
    ...purchaseFields,
    kind: z.literal("subscription"),
    startTime: z.string().optional(),
    days: z.number().optional(),
  }),
  z.object({
    kind: z.literal("extension"),
    targetId: z.string().min(1).max(100),
    planId: z.string().min(1).max(100),
    hours: z.number().int().min(1).max(24),
    idempotencyKey: z.uuid(),
  }),
]);

async function lockOrder(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM admin.payment_orders WHERE id = ${id} FOR UPDATE`;
  return tx.paymentOrder.findUniqueOrThrow({ where: { id } });
}

async function setEntitlement(
  tx: Prisma.TransactionClient,
  order: PaymentOrder,
  confirmed: boolean,
) {
  if (order.targetType === "visit")
    await tx.booking.update({
      where: { id: order.targetId },
      data: { status: confirmed ? "CONFIRMED" : "CANCELLED" },
    });
  else if (order.targetType === "flex")
    await tx.flexBooking.update({
      where: { id: order.targetId },
      data: { status: confirmed ? "CONFIRMED" : "CANCELLED" },
    });
  else
    await tx.subscription.update({
      where: { id: order.targetId },
      data: { status: confirmed ? "ACTIVE" : "CANCELLED" },
    });
}

export async function createCheckout(
  userId: string,
  input: z.infer<typeof checkoutSchema>,
) {
  paymentConfig();
  if (!process.env.CHECKOUT_BASE_URL || !process.env.CHECKOUT_SIGNING_SECRET)
    throw new Error("Checkout is not configured");
  const { idempotencyKey, ...purchase } = input;
  const requestHash = createHash("sha256")
    .update(JSON.stringify(purchase))
    .digest("hex");
  await expireCheckouts();
  const order = await prisma.$transaction(async (tx) => {
    // Serialize a customer's retries and competing subscription checkouts.
    // $executeRaw: pg_advisory_xact_lock returns void, which the pg driver
    // adapter cannot deserialize through $queryRaw.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
    const existing = await tx.paymentOrder.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new Error("Checkout key already used for a different request");
      return existing;
    }
    const active = await tx.$queryRaw<
      { active: boolean }[]
    >`SELECT is_active AS active FROM public.profiles WHERE id::text = ${userId}`;
    if (!active[0]?.active) throw new Error("Customer account is not active");
    await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
    const holds =
      input.kind === "extension"
        ? await tx.$queryRaw<
            {
              target_id: string;
              amount_paise: number;
              starts_at: Date;
              vendor_id: string;
            }[]
          >`SELECT * FROM admin.reserve_extension(${input.targetId},${input.planId},${input.hours}::integer)`
        : await tx.$queryRaw<
            {
              target_id: string;
              amount_paise: number;
              starts_at: Date;
              vendor_id?: string;
            }[]
          >`
        SELECT * FROM admin.reserve_purchase(${input.kind}, ${input.vendorId}, ${input.planId}, ${input.date}::date, ${input.startTime ?? null}::time, ${input.days ?? null}::integer)`;
    const hold = holds[0];
    if (!hold || !hold.starts_at || hold.starts_at <= new Date())
      throw new Error("Choose a future access window");
    return tx.paymentOrder.create({
      data: {
        id: randomUUID(),
        userId,
        vendorId: input.kind === "extension" ? hold.vendor_id! : input.vendorId,
        targetType: input.kind === "extension" ? "flex" : input.kind,
        targetId: hold.target_id,
        amountPaise: hold.amount_paise,
        startsAt: hold.starts_at,
        expiresAt: new Date(
          Math.min(Date.now() + 15 * 60_000, hold.starts_at.getTime()),
        ),
        idempotencyKey,
        requestHash,
      },
    });
  });
  if (order.status !== "CREATED" || order.expiresAt <= new Date()) return order;
  if (order.gatewayOrderId) return order;
  // Receipt is stable. Reconcile by receipt after a network timeout before
  // creating another remote order. Only the locally bound remote id is accepted.
  return prisma.$transaction(
    async (tx) => {
      const current = await lockOrder(tx, order.id);
      if (current.gatewayOrderId || current.status !== "CREATED")
        return current;
      const matches = await razorpay<{
        items: {
          id: string;
          receipt: string;
          amount: number;
          currency: string;
        }[];
      }>(`orders?receipt=${encodeURIComponent(current.id)}&count=100`);
      const remote =
        matches.items.find((item) => item.receipt === current.id) ??
        (await razorpay<{ id: string; amount: number; currency: string }>(
          "orders",
          {
            amount: current.amountPaise,
            currency: current.currency,
            receipt: current.id,
          },
        ));
      if (
        remote.amount !== current.amountPaise ||
        remote.currency !== current.currency
      )
        throw new Error("Payment order amount mismatch");
      return tx.paymentOrder.update({
        where: { id: current.id },
        data: { gatewayOrderId: remote.id },
      });
    },
    { timeout: 30_000 },
  );
}

export function checkoutToken(order: PaymentOrder) {
  const secret = process.env.CHECKOUT_SIGNING_SECRET;
  if (!secret) throw new Error("Checkout is not configured");
  return createHmac("sha256", secret)
    .update(`${order.id}|${order.expiresAt.getTime()}`)
    .digest("hex");
}

export function assertCheckoutToken(order: PaymentOrder, token: string) {
  const secret = process.env.CHECKOUT_SIGNING_SECRET;
  if (
    !secret ||
    !validSignature(
      `${order.id}|${order.expiresAt.getTime()}`,
      token,
      secret,
    ) ||
    order.expiresAt <= new Date()
  )
    throw new Error("Checkout link expired");
}

export async function recordCapture(payment: GatewayPayment, eventId: string) {
  const reference = await prisma.paymentOrder.findUnique({
    where: { gatewayOrderId: payment.order_id },
  });
  if (!reference) return; // An event for another product/account integration.
  if (
    payment.status !== "captured" ||
    payment.amount !== reference.amountPaise ||
    payment.currency !== reference.currency
  )
    throw new Error("Payment verification failed");
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, reference.id);
    if (await tx.paymentEvent.findUnique({ where: { id: eventId } })) return;
    let disposition = captureDisposition(
      order.status,
      order.expiresAt,
      new Date(),
    );
    if (disposition === "confirm") {
      const published = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM public.published_listings WHERE id = ${order.vendorId}`;
      if (!published.length) disposition = "refund";
    }
    if (disposition !== "unchanged") {
      if (disposition === "confirm") await setEntitlement(tx, order, true);
      else await setEntitlement(tx, order, false);
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: disposition === "confirm" ? "CAPTURED" : "REFUND_PENDING",
          gatewayPaymentId: payment.id,
          capturedAt: new Date(),
        },
      });
      const recipients = await tx.user.findMany({
        where: {
          partnerId: (
            await tx.vendor.findUniqueOrThrow({ where: { id: order.vendorId } })
          ).partnerId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (recipients.length)
        await tx.portalNotification.createMany({
          data: recipients.map((user) => ({
            userId: user.id,
            title:
              disposition === "confirm"
                ? "New paid booking"
                : "Late payment: refund pending",
            body: `A ${order.targetType} payment of ₹${order.amountPaise / 100} was received.`,
            href: `/vendors/${order.vendorId}?tab=bookings`,
          })),
        });
      await tx.customerNotification.upsert({
        where: { eventKey: `capture:${order.id}` },
        update: {},
        create: {
          userId: order.userId,
          eventKey: `capture:${order.id}`,
          title:
            disposition === "confirm"
              ? "Booking confirmed"
              : "Payment received after reservation expired",
          body:
            disposition === "confirm"
              ? "Your payment is verified and your seat is reserved. Find the details in My Bookings or My Subscriptions."
              : "Your seat could not be confirmed. A full refund will be processed.",
        },
      });
    }
    await tx.paymentEvent.create({
      data: { id: eventId, orderId: order.id, kind: "payment.captured" },
    });
  });
  await processRefund(reference.id);
}

export async function cancelPaidPurchase(
  targetId: string,
  actor: { userId: string; kind: "customer" | "partner" },
) {
  const reference = await prisma.paymentOrder.findUniqueOrThrow({
    where: { targetId },
  });
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, reference.id);
    if (actor.kind === "customer" && order.userId !== actor.userId)
      throw new Error("Purchase not found");
    if (
      order.cancelledAt ||
      ["REFUND_PENDING", "REFUNDED", "EXPIRED", "CANCELLED"].includes(
        order.status,
      )
    )
      return;
    const cancelledAt = new Date();
    await setEntitlement(tx, order, false);
    await tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        cancelledAt,
        status:
          order.status === "CAPTURED" &&
          refundEligible(order.startsAt, cancelledAt, actor.kind)
            ? "REFUND_PENDING"
            : "CANCELLED",
      },
    });
    await tx.paymentEvent.create({
      data: {
        id: randomUUID(),
        orderId: order.id,
        kind: `${actor.kind}.cancelled`,
      },
    });
    await tx.customerNotification.upsert({
      where: { eventKey: `cancel:${order.id}` },
      update: {},
      create: {
        userId: order.userId,
        eventKey: `cancel:${order.id}`,
        title: "Reservation cancelled",
        body:
          order.status === "CAPTURED" &&
          refundEligible(order.startsAt, cancelledAt, actor.kind)
            ? "A full refund has been requested."
            : "Your reservation was cancelled. Refunds are available only before the reserved start.",
      },
    });
  });
  await processRefund(reference.id);
}

export async function processRefund(orderId: string) {
  const order = await prisma.paymentOrder.findUniqueOrThrow({
    where: { id: orderId },
  });
  if (order.status !== "REFUND_PENDING" || !order.gatewayPaymentId) return;
  // Stable provider-supported idempotency key makes retries safe after timeouts.
  const refund = order.refundId
    ? await razorpay<{ id: string; status: string }>(
        `refunds/${encodeURIComponent(order.refundId)}`,
      )
    : await razorpay<{ id: string; status: string }>(
        `payments/${encodeURIComponent(order.gatewayPaymentId)}/refund`,
        { amount: order.amountPaise },
        { "X-Refund-Idempotency": `refund-${order.id}` },
      );
  await prisma.paymentOrder.updateMany({
    where: { id: order.id, status: "REFUND_PENDING" },
    data: {
      refundId: refund.id,
      status: refund.status === "processed" ? "REFUNDED" : "REFUND_PENDING",
    },
  });
}

export async function expireCheckouts() {
  const orders = await prisma.paymentOrder.findMany({
    where: { status: "CREATED", expiresAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });
  for (const reference of orders)
    await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, reference.id);
      if (order.status !== "CREATED" || order.expiresAt > new Date()) return;
      await setEntitlement(tx, order, false);
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: "EXPIRED" },
      });
    });
}

export async function expireSubscriptions() {
  await prisma.$transaction(async (tx) => {
    const expired = await tx.$queryRaw<
      { id: string; user_id: string; plan_name: string | null }[]
    >`
      UPDATE admin.subscriptions s SET status='EXPIRED',updated_at=now() FROM admin.vendors v
      WHERE v.id=s.vendor_id AND s.status='ACTIVE' AND s.end_date::date<=(now() AT TIME ZONE v.time_zone)::date
      RETURNING s.id,s.user_id,s.plan_name`;
    for (const row of expired)
      await tx.customerNotification.upsert({
        where: { eventKey: `expiry:${row.id}` },
        update: {},
        create: {
          eventKey: `expiry:${row.id}`,
          userId: row.user_id,
          title: "Subscription expired",
          body: `Your ${row.plan_name ?? "Library"} subscription has ended. Choose a new plan to reserve your next access window.`,
        },
      });
  });
}
