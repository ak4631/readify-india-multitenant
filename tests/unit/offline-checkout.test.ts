import type { PaymentOrder } from "@/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({
  settings: { onlineEnabled: true, offlineEnabled: true, offlineHoldHours: 24 },
  create: vi.fn(),
  gateway: vi.fn(),
  config: vi.fn(),
  existing: null as Partial<PaymentOrder> | null,
  raw: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/razorpay", () => ({
  razorpay: s.gateway,
  paymentConfig: s.config,
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: s.raw,
    membershipPlan: {
      findUniqueOrThrow: async () => ({
        durationUnit: "MONTHS",
        durationValue: 1,
      }),
    },
    paymentSettings: { findUnique: async () => s.settings },
    paymentOrder: {
      findMany: async () => [],
      findUnique: async () => s.existing,
      create: s.create,
    },
  };
  return {
    prisma: {
      ...tx,
      $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx),
    },
  };
});
import { createCheckout, checkoutSchema } from "@/lib/payments";
const input = () =>
  checkoutSchema.parse({
    kind: "subscription",
    vendorId: "vendor",
    planId: "plan",
    date: "2035-01-01",
    paymentMethod: "OFFLINE",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  });
describe("offline checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    s.settings = {
      onlineEnabled: true,
      offlineEnabled: true,
      offlineHoldHours: 24,
    };
    s.existing = null;
    s.create.mockImplementation(async ({ data }: { data: PaymentOrder }) => ({
      ...data,
      status: "CREATED",
    }));
    s.raw.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("").includes("reserve_purchase")
        ? [
            {
              target_id: "target",
              amount_paise: 10600,
              starts_at: new Date("2035-01-01T04:30Z"),
            },
          ]
        : [{ active: true }],
    );
  });
  it("creates a priced pending reservation without any gateway configuration or call", async () => {
    s.settings.onlineEnabled = false;
    const result = await createCheckout("customer", input());
    expect(result.paymentMethod).toBe("OFFLINE");
    expect(result.verificationRequired).toBe(true);
    expect(result.amountPaise).toBe(10600);
    expect(result.expiresAt).toEqual(new Date("2035-01-02T04:30Z"));
    expect(s.config).not.toHaveBeenCalled();
    expect(s.gateway).not.toHaveBeenCalled();
  });
  it("rejects disabled offline payment before reserving capacity", async () => {
    s.settings.offlineEnabled = false;
    await expect(createCheckout("customer", input())).rejects.toThrow(
      "disabled",
    );
    expect(s.create).not.toHaveBeenCalled();
    expect(
      s.raw.mock.calls.some(([sql]) =>
        sql.join("").includes("reserve_purchase"),
      ),
    ).toBe(false);
  });
  it("returns the original order after a setting changes, without reserving twice", async () => {
    const first = await createCheckout("customer", input());
    s.existing = first;
    s.settings.offlineEnabled = false;
    const second = await createCheckout("customer", input());
    expect(second.id).toBe(first.id);
    expect(s.create).toHaveBeenCalledOnce();
  });
  it("rejects retry keys reused for a different purchase", async () => {
    s.existing = { requestHash: "different" };
    await expect(createCheckout("customer", input())).rejects.toThrow(
      "different request",
    );
    expect(s.create).not.toHaveBeenCalled();
  });
});
