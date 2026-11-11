import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  access: vi.fn(),
  reference: vi.fn(),
  audit: vi.fn(),
  ready: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    vendor: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    listingRevision: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    listingChange: { updateMany: vi.fn() },
    membershipPlan: { update: vi.fn() },
    portalNotification: { create: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    listingRevision: { findUniqueOrThrow: mocks.reference },
    $transaction: async (cb: (tx: unknown) => unknown) => cb(mocks.tx),
  },
}));
vi.mock("@/lib/rbac", () => ({
  requireSuperAdminPermission: mocks.authorize,
  requireVendorAccess: mocks.access,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/lib/listing-readiness", async (original) => ({
  ...(await original<typeof import("@/lib/listing-readiness")>()),
  getReadiness: mocks.ready,
}));
import { reviewListingRevision } from "@/server/actions/listing-changes.actions";
import { snapshotDigest } from "@/lib/listing-snapshot";
const change = {
  id: "change",
  vendorId: "vendor",
  kind: "PLAN_UPDATE",
  targetId: "plan",
  payload: {
    name: "Flex",
    price: 20,
    durationValue: 1,
    durationUnit: "HOURS",
    dailyHours: 2,
    isFlexible: true,
  },
};
const digest = () =>
  snapshotDigest({
    baseVersion: 2,
    changes: [change].map((c) => ({
      id: c.id,
      kind: c.kind,
      targetId: c.targetId,
      payload: c.payload,
    })),
  });
describe("atomic versioned content decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ user: { id: "super" } });
    mocks.reference.mockResolvedValue({ vendorId: "vendor" });
    mocks.tx.vendor.findUniqueOrThrow.mockResolvedValue({
      id: "vendor",
      name: "Library",
      status: "PUBLISHED",
      contentVersion: 2,
    });
    mocks.tx.listingRevision.findUniqueOrThrow.mockResolvedValue({
      id: "revision",
      vendorId: "vendor",
      requestedBy: "owner",
      status: "PENDING",
      baseVersion: 2,
      changes: [change],
    });
    mocks.ready.mockResolvedValue({ ready: true, issues: [] });
  });
  it("rejects a whole revision without touching approved data", async () => {
    await reviewListingRevision(
      "revision",
      digest(),
      false,
      "Correct the price",
    );
    expect(mocks.tx.membershipPlan.update).not.toHaveBeenCalled();
    expect(mocks.tx.listingRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED" }),
      }),
    );
  });
  it("applies the reviewed exact payload to a vendor-scoped target and increments the version", async () => {
    await reviewListingRevision("revision", digest(), true);
    expect(mocks.tx.membershipPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "plan", vendorId: "vendor" },
        data: expect.objectContaining({ price: 20 }),
      }),
    );
    expect(mocks.tx.vendor.update).toHaveBeenCalledWith({
      where: { id: "vendor" },
      data: { contentVersion: { increment: 1 } },
    });
  });
  it("denies stale previews and stale base versions before applying anything", async () => {
    await expect(
      reviewListingRevision("revision", "stale", true),
    ).rejects.toThrow("Reload");
    mocks.tx.vendor.findUniqueOrThrow.mockResolvedValue({
      id: "vendor",
      status: "PUBLISHED",
      contentVersion: 3,
    });
    await expect(
      reviewListingRevision("revision", digest(), true),
    ).rejects.toThrow("older approved version");
    expect(mocks.tx.membershipPlan.update).not.toHaveBeenCalled();
  });
  it("does not replay an already-decided revision", async () => {
    mocks.tx.listingRevision.findUniqueOrThrow.mockResolvedValue({
      status: "APPROVED",
    });
    await expect(
      reviewListingRevision("revision", digest(), true),
    ).rejects.toThrow("not awaiting");
    expect(mocks.tx.membershipPlan.update).not.toHaveBeenCalled();
  });
  it("requires Super Admin authority before reading the revision", async () => {
    mocks.authorize.mockRejectedValue(new Error("Super admin access required"));
    await expect(
      reviewListingRevision("revision", digest(), true),
    ).rejects.toThrow("Super admin");
    expect(mocks.reference).not.toHaveBeenCalled();
  });
  it("does not mark an approval successful when final readiness fails", async () => {
    mocks.ready.mockResolvedValue({
      issues: [{ section: "plans", message: "A required plan is missing" }],
    });
    await expect(
      reviewListingRevision("revision", digest(), true),
    ).rejects.toThrow("required plan");
    expect(mocks.tx.listingRevision.update).not.toHaveBeenCalled();
  });
});
