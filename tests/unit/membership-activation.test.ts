import type { PaymentOrder } from "@/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({
  order: {} as Partial<PaymentOrder>,
  card: null as { id: string } | null,
  deny: false,
  uploads: vi.fn(),
  deleted: vi.fn(),
  updates: vi.fn(),
  cards: vi.fn(),
  events: vi.fn(),
  windows: 1,
  invalid: 0,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rbac", () => ({
  requirePermission: vi.fn(),
  requireVendorAccess: async () => {
    if (s.deny) throw new Error("Wrong location");
    return { user: { id: "partner" } };
  },
}));
vi.mock("@/lib/imagekit", () => ({
  uploadMembershipPhoto: s.uploads,
  deleteVendorPhoto: s.deleted,
  getSignedDocumentUrl: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/profiles", () => ({ lookupCustomerProfiles: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const db = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const q = strings.join("");
      if (q.includes("membership_windows_valid"))
        return [{ valid: s.windows > 0 && s.invalid === 0 }];
      if (q.includes("count(*)"))
        return [{ n: q.includes("NOT EXISTS") ? s.invalid : s.windows }];
      return [{ id: s.order.id }];
    },
    $executeRaw: async () => 1,
    paymentOrder: {
      findUniqueOrThrow: async () => ({ ...s.order }),
      update: s.updates,
    },
    membershipCard: { findUnique: async () => s.card, create: s.cards },
    flexBooking: {
      findUniqueOrThrow: async () => ({ status: "PENDING" }),
      update: vi.fn(),
    },
    paymentEvent: { create: s.events },
    customerNotification: { upsert: vi.fn() },
  };
  return {
    prisma: {
      ...db,
      $transaction: async (fn: (value: typeof db) => unknown) => fn(db),
    },
  };
});
import { activateMembership } from "@/server/actions/membership-activation.actions";
function form() {
  const f = new FormData();
  f.set("targetId", "target");
  f.set("customerVerified", "on");
  f.set("paymentReceived", "on");
  f.set(
    "selfie",
    new File([new Uint8Array([255, 216, 255, 224])], "selfie.jpg", {
      type: "image/jpeg",
    }),
  );
  return f;
}
describe("partner activation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    s.order = {
      id: "order",
      vendorId: "vendor",
      userId: "customer",
      targetId: "target",
      targetType: "flex",
      paymentMethod: "OFFLINE",
      status: "CREATED",
      expiresAt: new Date(Date.now() + 3600000),
      amountPaise: 1600,
    };
    s.card = null;
    s.deny = false;
    s.windows = 1;
    s.invalid = 0;
    s.uploads.mockResolvedValue({ path: "/private/selfie", fileId: "file" });
    s.deleted.mockResolvedValue(undefined);
    s.cards.mockResolvedValue({ id: "membership" });
  });
  it("confirms offline payment and creates exactly one card with the authenticated verifier", async () => {
    await activateMembership(form());
    expect(s.updates).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CAPTURED",
          capturedAt: expect.any(Date),
        }),
      }),
    );
    expect(s.cards).toHaveBeenCalledWith({
      data: expect.objectContaining({
        verifiedBy: "partner",
        photoPath: "/private/selfie",
      }),
    });
    expect(s.events).toHaveBeenCalledOnce();
    expect(s.deleted).not.toHaveBeenCalled();
    s.card = { id: "membership" };
    await activateMembership(form());
    expect(s.cards).toHaveBeenCalledOnce();
    expect(s.uploads).toHaveBeenCalledOnce();
  });
  it("rejects other partner locations before uploading", async () => {
    s.deny = true;
    await expect(activateMembership(form())).rejects.toThrow("Wrong location");
    expect(s.uploads).not.toHaveBeenCalled();
  });
  it("requires identity verification and explicit receipt of offline payment", async () => {
    const f = form();
    f.delete("customerVerified");
    await expect(activateMembership(f)).rejects.toThrow("identity");
    f.set("customerVerified", "on");
    f.delete("paymentReceived");
    await expect(activateMembership(f)).rejects.toThrow("payment");
    expect(s.cards).not.toHaveBeenCalled();
  });
  it("never allows a partner to confirm an unpaid online order", async () => {
    s.order.paymentMethod = "ONLINE";
    await expect(activateMembership(form())).rejects.toThrow("gateway");
    expect(s.updates).not.toHaveBeenCalled();
    expect(s.uploads).not.toHaveBeenCalled();
  });
  it("rejects expired holds before uploading a photo", async () => {
    s.order.expiresAt = new Date(0);
    await expect(activateMembership(form())).rejects.toThrow("deadline");
    expect(s.cards).not.toHaveBeenCalled();
    expect(s.uploads).not.toHaveBeenCalled();
  });
  it("rejects a spoofed image before upload", async () => {
    const f = form();
    f.set(
      "selfie",
      new File(["not an image"], "selfie.jpg", { type: "image/jpeg" }),
    );
    await expect(activateMembership(f)).rejects.toThrow("valid JPG");
    expect(s.uploads).not.toHaveBeenCalled();
  });
  it("rejects activation when no access windows remain or opening hours changed", async () => {
    s.windows = 0;
    await expect(activateMembership(form())).rejects.toThrow("No valid");
    s.windows = 1;
    s.invalid = 1;
    await expect(activateMembership(form())).rejects.toThrow("opening hours");
    expect(s.cards).not.toHaveBeenCalled();
  });
  it("retains the gateway capture timestamp during later verification", async () => {
    s.order.paymentMethod = "ONLINE";
    s.order.status = "CAPTURED";
    s.order.capturedAt = new Date("2030-01-02T09:00:00Z");
    await activateMembership(form());
    expect(s.updates).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ capturedAt: s.order.capturedAt }),
      }),
    );
  });
});
