import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  authenticate: vi.fn(),
  find: vi.fn(),
  expire: vi.fn(),
  gateway: vi.fn(),
  seat: vi.fn(),
  vendor: vi.fn(),
}));
vi.mock("@/lib/customer-api", () => ({
  requireCustomer: state.authenticate,
  apiFailure: () => Response.json({ error: "failed" }, { status: 401 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentOrder: { findUniqueOrThrow: state.find },
    $queryRaw: state.seat,
    vendor: { findUniqueOrThrow: state.vendor },
  },
}));
vi.mock("@/lib/payments", () => ({
  expireCheckouts: state.expire,
  recordCapture: vi.fn(),
  cancelPaidPurchase: vi.fn(),
}));
vi.mock("@/lib/razorpay", () => ({ razorpay: state.gateway }));
import { GET } from "@/app/api/customer/orders/[id]/route";
beforeEach(() => {
  vi.clearAllMocks();
  state.authenticate.mockResolvedValue({ id: "customer" });
  state.find.mockResolvedValue({
    id: "order",
    status: "CAPTURED",
    startsAt: new Date(),
    targetId: "target",
    targetType: "visit",
    vendorId: "vendor",
  });
  state.seat.mockResolvedValue([]);
  state.vendor.mockResolvedValue({ timeZone: "Asia/Kolkata" });
});
it("authenticates once and expires only the polled order without a gateway call for captured payments", async () => {
  const response = await GET(
    new Request("http://localhost/api/customer/orders/order"),
    { params: Promise.resolve({ id: "order" }) },
  );
  expect(response.status).toBe(200);
  expect(state.authenticate).toHaveBeenCalledTimes(1);
  expect(state.expire).toHaveBeenCalledExactlyOnceWith("order");
  expect(state.gateway).not.toHaveBeenCalled();
  for (const [query] of state.find.mock.calls)
    expect(query.where).toEqual({ id: "order", userId: "customer" });
});
it("rejects unauthenticated polling before database or expiry work", async () => {
  state.authenticate.mockRejectedValueOnce(new Error("Not authenticated"));
  expect(
    (
      await GET(new Request("http://localhost"), {
        params: Promise.resolve({ id: "order" }),
      })
    ).status,
  ).toBe(401);
  expect(state.find).not.toHaveBeenCalled();
  expect(state.expire).not.toHaveBeenCalled();
});
