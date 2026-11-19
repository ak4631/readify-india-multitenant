import { beforeEach, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ allowed: true, save: vi.fn(), audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rbac", () => ({
  requireSuperAdmin: async () => {
    if (!s.allowed) throw new Error("Super admin access required");
    return { user: { id: "super" } };
  },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: s.audit }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    paymentSettings: {
      findUnique: async () => ({
        id: "platform",
        onlineEnabled: true,
        offlineEnabled: true,
      }),
      upsert: s.save,
    },
  };
  return {
    prisma: { $transaction: async (fn: (db: typeof tx) => unknown) => fn(tx) },
  };
});
import { savePaymentSettings } from "@/server/actions/payment-settings.actions";
beforeEach(() => {
  vi.clearAllMocks();
  s.allowed = true;
});
it("restricts changes to Super Admin", async () => {
  s.allowed = false;
  await expect(
    savePaymentSettings({
      onlineEnabled: false,
      offlineEnabled: true,
      offlineHoldHours: 24,
    }),
  ).rejects.toThrow("Super admin");
  expect(s.save).not.toHaveBeenCalled();
});
it("rejects disabling both methods or an unbounded offline hold", async () => {
  await expect(
    savePaymentSettings({
      onlineEnabled: false,
      offlineEnabled: false,
      offlineHoldHours: 24,
    }),
  ).rejects.toThrow();
  await expect(
    savePaymentSettings({
      onlineEnabled: false,
      offlineEnabled: true,
      offlineHoldHours: 1000,
    }),
  ).rejects.toThrow();
  expect(s.save).not.toHaveBeenCalled();
});
it("saves and audits an offline-only configuration", async () => {
  await savePaymentSettings({
    onlineEnabled: false,
    offlineEnabled: true,
    offlineHoldHours: 24,
  });
  expect(s.save).toHaveBeenCalledOnce();
  expect(s.audit).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      action: "UPDATE_PAYMENT_SETTINGS",
      userId: "super",
    }),
  );
});
