import { beforeEach, expect, it, vi } from "vitest";
import type { PaymentOrder } from "@/generated/prisma/client";
const s = vi.hoisted(() => ({
  scope: [] as string[] | null,
  denied: false,
  find: vi.fn(),
  count: vi.fn(),
  details: vi.fn(),
  vendors: vi.fn(),
}));
vi.mock("@/lib/rbac", () => ({
  requirePermission: async () => {
    if (s.denied) throw new Error("Denied");
    return { user: { id: "partner" } };
  },
  getAccessibleVendorIds: async () => s.scope,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentOrder: { findMany: s.find, count: s.count },
    vendor: { findMany: s.vendors },
    $queryRaw: s.details,
  },
}));
import { listPendingPayments } from "@/server/actions/pending-payments.actions";
beforeEach(() => {
  vi.clearAllMocks();
  s.scope = ["own-vendor"];
  s.denied = false;
  s.find.mockResolvedValue([]);
  s.count.mockResolvedValue(0);
  s.details.mockResolvedValue([]);
  s.vendors.mockResolvedValue([{ id: "other-vendor" }]);
});
it("restricts both rows and count to unpaid, uncancelled, unexpired bookings at accessible locations", async () => {
  await listPendingPayments({ page: 2, pageSize: 5 });
  const expected = expect.objectContaining({
    status: "CREATED",
    cancelledAt: null,
    expiresAt: { gt: expect.any(Date) },
    vendorId: { in: ["own-vendor"] },
  });
  expect(s.find).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expected,
      skip: 5,
      take: 5,
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    }),
  );
  expect(s.count).toHaveBeenCalledWith({ where: expected });
});
it("never broadens an empty partner scope to platform access", async () => {
  s.scope = [];
  await listPendingPayments();
  expect(s.find).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ vendorId: { in: [] } }),
    }),
  );
});
it("checks authorization before querying customer payment data", async () => {
  s.denied = true;
  await expect(listPendingPayments()).rejects.toThrow("Denied");
  expect(s.find).not.toHaveBeenCalled();
});
it("returns the subscription booking code and location timezone with a quick activation target", async () => {
  const order = {
    id: "order",
    targetId: "sub-id",
    targetType: "subscription",
    amountPaise: 100600,
    paymentMethod: "OFFLINE",
    expiresAt: new Date("2030-01-02"),
    startsAt: new Date("2030-01-01"),
  } as PaymentOrder;
  s.find.mockResolvedValue([order]);
  s.count.mockResolvedValue(1);
  s.details.mockResolvedValue([
    {
      id: "order",
      customerName: "Customer",
      vendorName: "Library",
      planName: "Monthly",
      bookingCode: "subscription:sub-id",
      timeZone: "Asia/Kolkata",
    },
  ]);
  const result = await listPendingPayments();
  expect(result.total).toBe(1);
  expect(result.items[0]).toMatchObject({
    targetId: "sub-id",
    bookingCode: "subscription:sub-id",
    timeZone: "Asia/Kolkata",
    paymentMethod: "OFFLINE",
    amountPaise: 100600,
  });
});

it("applies search, selected listing and IST date without replacing tenant or unpaid constraints", async () => {
  await listPendingPayments({
    vendorId: "other-vendor",
    q: "South",
    date: "2035-01-05",
    status: "pending",
  });
  const where = s.find.mock.calls[0][0].where;
  expect(where.vendorId).toEqual({ in: ["own-vendor"] });
  expect(where.status).toBe("CREATED");
  expect(where.AND).toContainEqual({ vendorId: "other-vendor" });
  expect(where.AND).toContainEqual({
    createdAt: {
      gte: new Date("2035-01-04T18:30:00Z"),
      lt: new Date("2035-01-05T18:30:00Z"),
    },
  });
  expect(where.AND).toContainEqual({
    OR: expect.arrayContaining([
      { id: { contains: "South", mode: "insensitive" } },
      { vendorId: { in: ["other-vendor"] } },
    ]),
  });
  expect(s.count.mock.calls[0][0].where).toEqual(where);
});
