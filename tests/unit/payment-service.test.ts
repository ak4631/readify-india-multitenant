import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  order: {} as Record<string, unknown>,
  events: new Set<string>(),
  gateway: vi.fn(),
  bookingUpdate: vi.fn(),
  notification: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/razorpay", () => ({
  paymentConfig: () => ({ keyId: "test", keySecret: "test" }),
  razorpay: state.gateway,
}));
vi.mock("@/lib/prisma", () => {
  const paymentOrder = {
    findUnique: vi.fn(async () => ({ ...state.order })),
    findUniqueOrThrow: vi.fn(async () => ({ ...state.order })),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ data }: { data: object }) =>
      Object.assign(state.order, data),
    ),
    updateMany: vi.fn(async ({ data }: { data: object }) =>
      Object.assign(state.order, data),
    ),
  };
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: "vendor" }]),
    paymentOrder,
    booking: { update: state.bookingUpdate },
    flexBooking: { update: state.bookingUpdate },
    subscription: { update: state.bookingUpdate },
    paymentEvent: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        state.events.has(where.id) ? { id: where.id } : null,
      ),
      create: vi.fn(async ({ data }: { data: { id: string } }) =>
        state.events.add(data.id),
      ),
    },
    user: { findMany: vi.fn(async () => []) },
    vendor: {
      findUniqueOrThrow: vi.fn(async () => ({ partnerId: "partner" })),
    },
    customerNotification: { upsert: state.notification },
  };
  return {
    prisma: {
      ...tx,
      $transaction: async (callback: (value: unknown) => unknown) =>
        callback(tx),
    },
  };
});
import { cancelPaidPurchase, recordCapture } from "@/lib/payments";

describe("verified payment state transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.events.clear();
    state.order = {
      id: "order-unique-id",
      userId: "customer",
      vendorId: "vendor",
      targetId: "booking",
      targetType: "flex",
      status: "CREATED",
      amountPaise: 4600,
      currency: "INR",
      gatewayOrderId: "gateway-order",
      gatewayPaymentId: null,
      refundId: null,
      cancelledAt: null,
      startsAt: new Date(Date.now() + 3_600_000),
      expiresAt: new Date(Date.now() + 900_000),
    };
    state.gateway.mockResolvedValue({ id: "refund-one", status: "processed" });
  });
  const payment = {
    id: "payment",
    order_id: "gateway-order",
    status: "captured",
    amount: 4600,
    currency: "INR",
  };
  it("confirms once across duplicate callbacks and a different webhook id", async () => {
    await recordCapture(payment, "callback");
    await recordCapture(payment, "callback");
    await recordCapture(payment, "webhook");
    expect(state.order.status).toBe("CAPTURED");
    expect(state.bookingUpdate).toHaveBeenCalledTimes(1);
    expect(state.gateway).not.toHaveBeenCalled();
  });
  it("rejects a captured amount that does not match the server quote", async () => {
    await expect(
      recordCapture({ ...payment, amount: 1 }, "event"),
    ).rejects.toThrow("verification");
    expect(state.bookingUpdate).not.toHaveBeenCalled();
  });
  it("refunds late captures without reactivating the released seat", async () => {
    state.order.status = "EXPIRED";
    await recordCapture(payment, "late");
    expect(state.order.status).toBe("REFUNDED");
    expect(state.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CANCELLED" } }),
    );
    expect(state.gateway).toHaveBeenCalledWith(
      "payments/payment/refund",
      { amount: 4600 },
      { "X-Refund-Idempotency": "refund-order-unique-id" },
    );
  });
  it("does not refund a customer cancellation at or after the reserved start", async () => {
    state.order.status = "CAPTURED";
    state.order.gatewayPaymentId = "payment";
    state.order.startsAt = new Date(Date.now() - 1000);
    await cancelPaidPurchase("booking", {
      userId: "customer",
      kind: "customer",
    });
    expect(state.order.status).toBe("CANCELLED");
    expect(state.gateway).not.toHaveBeenCalled();
  });
  it("rejects cancellation by a different customer", async () => {
    await expect(
      cancelPaidPurchase("booking", { userId: "intruder", kind: "customer" }),
    ).rejects.toThrow("not found");
    expect(state.bookingUpdate).not.toHaveBeenCalled();
  });
});
