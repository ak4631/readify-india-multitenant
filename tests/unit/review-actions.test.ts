import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    vendor: { findUniqueOrThrow: vi.fn() },
    listingChange: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    membershipPlan: { update: vi.fn() },
    portalNotification: { create: vi.fn() },
  },
  reference: vi.fn(),
  authorize: vi.fn(),
  access: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    listingChange: { findUniqueOrThrow: mocks.reference },
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback(mocks.tx),
  },
}));
vi.mock("@/lib/rbac", () => ({
  requirePlatformPermission: mocks.authorize,
  requireVendorAccess: mocks.access,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
import { reviewListingChange } from "@/server/actions/listing-changes.actions";

describe("material change review actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ user: { id: "moderator" } });
    mocks.reference.mockResolvedValue({ vendorId: "vendor" });
    mocks.tx.vendor.findUniqueOrThrow.mockResolvedValue({
      id: "vendor",
      name: "Library",
      status: "PUBLISHED",
    });
    mocks.tx.listingChange.findUniqueOrThrow.mockResolvedValue({
      id: "change",
      vendorId: "vendor",
      kind: "PLAN_UPDATE",
      targetId: "plan",
      requestedBy: "owner",
      status: "PENDING",
      payload: {
        name: "Flex",
        price: 20,
        durationValue: 1,
        durationUnit: "HOURS",
        dailyHours: 2,
        isFlexible: true,
      },
    });
  });
  it("keeps rejected changes out of approved plan data", async () => {
    await reviewListingChange("change", false, "Price requires correction");
    expect(mocks.tx.membershipPlan.update).not.toHaveBeenCalled();
    expect(mocks.tx.listingChange.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED" }),
      }),
    );
    expect(mocks.tx.portalNotification.create).toHaveBeenCalled();
  });
  it("applies an approved change to its original vendor-scoped target", async () => {
    await reviewListingChange("change", true);
    expect(mocks.tx.membershipPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "plan", vendorId: "vendor" },
        data: expect.objectContaining({ price: 20 }),
      }),
    );
  });
  it("does not allow a decision to be applied twice", async () => {
    mocks.tx.listingChange.findUniqueOrThrow.mockResolvedValue({
      status: "APPROVED",
    });
    await expect(reviewListingChange("change", true)).rejects.toThrow(
      "already been reviewed",
    );
    expect(mocks.tx.membershipPlan.update).not.toHaveBeenCalled();
  });
  it("requires platform approval authority before accessing a proposed change", async () => {
    mocks.authorize.mockRejectedValue(
      new Error("Platform staff access required"),
    );
    await expect(reviewListingChange("change", true)).rejects.toThrow(
      "Platform staff",
    );
    expect(mocks.reference).not.toHaveBeenCalled();
  });
});
