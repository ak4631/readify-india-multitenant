import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  verified: false,
  required: true,
  admitted: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rbac", () => ({
  requireVendorAccess: async () => ({ user: { id: "partner" } }),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: async () => [
      {
        id: "target",
        vendorId: "vendor",
        userId: "customer",
        date: "2030-01-01",
      },
    ],
    paymentOrder: {
      findUnique: async () => ({
        id: "order",
        status: "CAPTURED",
        verificationRequired: state.required,
      }),
    },
    membershipCard: {
      findUnique: async () => (state.verified ? { id: "card" } : null),
    },
    attendanceVisit: { findFirst: async () => null, create: state.admitted },
  };
  return {
    prisma: {
      ...tx,
      $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx),
    },
  };
});
import { checkInByCode } from "@/server/actions/attendance.actions";
beforeEach(() => {
  vi.clearAllMocks();
  state.verified = false;
  state.required = true;
  state.admitted.mockResolvedValue({ id: "visit" });
});
it("blocks paid but unverified new bookings at entry", async () => {
  await expect(checkInByCode("QR-CODE")).rejects.toThrow("verification");
  expect(state.admitted).not.toHaveBeenCalled();
});
it("admits verified memberships through their existing QR", async () => {
  state.verified = true;
  await checkInByCode("QR-CODE");
  expect(state.admitted).toHaveBeenCalledOnce();
});
it("preserves entry for existing purchases created before verification was required", async () => {
  state.required = false;
  await checkInByCode("QR-CODE");
  expect(state.admitted).toHaveBeenCalledOnce();
});
