import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  reference: vi.fn(),
  snapshot: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  rollback: vi.fn(),
  transaction: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    vendor: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    listingRevision: {
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    listingChange: { updateMany: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/rbac", () => ({ requireVendorAccess: mocks.access }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    listingRevision: { findUniqueOrThrow: mocks.reference },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/listing-snapshot", async (original) => ({
  ...(await original<typeof import("@/lib/listing-snapshot")>()),
  listingSnapshot: mocks.snapshot,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
import {
  reopenListingRevisionForCorrection,
  reviseListingRevision,
} from "@/server/actions/listing-changes.actions";

const plan = {
  id: "old-change",
  vendorId: "listing",
  kind: "PLAN_CREATE",
  targetId: "old-plan",
  payload: {
    name: "Prime Time",
    price: 1400,
    dailyStart: "09:00",
    dailyHours: 4,
    durationUnit: "MONTHS",
    durationValue: 1,
    isFlexible: false,
  },
};
const original = {
  id: "submitted",
  vendorId: "listing",
  baseVersion: 1,
  status: "PENDING",
  changes: [plan],
};

describe("safe reopening of pending listing revisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ user: { id: "editor" } });
    mocks.reference.mockResolvedValue({ vendorId: "listing" });
    mocks.tx.vendor.findUniqueOrThrow.mockResolvedValue({
      id: "listing",
      status: "PUBLISHED",
      contentVersion: 2,
      partnerId: "org",
    });
    mocks.tx.listingRevision.findUniqueOrThrow.mockResolvedValue(original);
    mocks.tx.listingRevision.findFirst.mockResolvedValue(null);
    mocks.tx.listingRevision.create.mockResolvedValue({ id: "editable-copy" });
    mocks.tx.listingChange.createMany.mockResolvedValue({ count: 1 });
    mocks.snapshot.mockResolvedValue({ name: "Approved library" });
    mocks.transaction.mockImplementation(async (callback) => {
      try {
        return await callback(mocks.tx);
      } catch (error) {
        mocks.rollback();
        throw error;
      }
    });
  });

  it("preserves the submitted plan in an editable copy while retaining its original history", async () => {
    await reopenListingRevisionForCorrection("submitted");
    expect(mocks.access).toHaveBeenCalledWith("listing", "vendor.update");
    expect(mocks.tx.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.tx.listingRevision.update).toHaveBeenCalledWith({
      where: { id: "submitted" },
      data: { status: "WITHDRAWN" },
    });
    expect(mocks.tx.listingChange.updateMany).toHaveBeenCalledWith({
      where: { revisionId: "submitted" },
      data: { status: "WITHDRAWN" },
    });
    expect(mocks.tx.listingRevision.create).toHaveBeenCalledWith({
      data: {
        vendorId: "listing",
        baseVersion: 2,
        baseSnapshot: { name: "Approved library" },
        requestedBy: "editor",
      },
    });
    const copy = mocks.tx.listingChange.createMany.mock.calls[0][0].data[0];
    expect(copy).toMatchObject({
      revisionId: "editable-copy",
      status: "DRAFT",
      kind: "PLAN_CREATE",
      payload: plan.payload,
    });
    expect(copy.id).not.toBe(plan.id);
    expect(copy.targetId).not.toBe(plan.targetId);
    expect(
      mocks.tx.listingRevision.update.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.tx.listingRevision.create.mock.invocationCallOrder[0]);
    expect(mocks.tx.vendor.update).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledTimes(2);
    expect(mocks.revalidate).toHaveBeenCalledWith("/vendors/listing");
    expect(mocks.revalidate).toHaveBeenCalledWith("/approvals");
  });

  it("keeps dependent proposal references consistent when create IDs change", async () => {
    const changes = [
      {
        id: "parent",
        vendorId: "listing",
        kind: "TRAINER_CREATE",
        targetId: "old-trainer",
        payload: { name: "Trainer" },
      },
      {
        id: "child",
        vendorId: "listing",
        kind: "TRAINER_PRICE_CREATE",
        targetId: "old-price",
        payload: { trainerId: "old-trainer", nested: { ids: ["old-trainer"] } },
      },
    ];
    mocks.tx.listingRevision.findUniqueOrThrow.mockResolvedValue({
      ...original,
      changes,
    });
    await reopenListingRevisionForCorrection("submitted");
    const data = mocks.tx.listingChange.createMany.mock.calls[0][0].data;
    expect(data[1].payload.trainerId).toBe(data[0].targetId);
    expect(data[1].payload.nested.ids).toEqual([data[0].targetId]);
    expect(changes[1].payload.trainerId).toBe("old-trainer");
  });

  it.each(["APPROVED", "REJECTED", "WITHDRAWN", "DRAFT"])(
    "refuses an already-decided or concurrently reopened %s revision",
    async (status) => {
      mocks.tx.listingRevision.findUniqueOrThrow.mockResolvedValue({
        ...original,
        status,
      });
      await expect(
        reopenListingRevisionForCorrection("submitted"),
      ).rejects.toThrow("Only a pending revision");
      expect(mocks.tx.listingRevision.update).not.toHaveBeenCalled();
      expect(mocks.tx.listingRevision.create).not.toHaveBeenCalled();
    },
  );

  it("checks tenant access before opening a write transaction", async () => {
    mocks.access.mockRejectedValue(new Error("Access denied"));
    await expect(
      reopenListingRevisionForCorrection("submitted"),
    ).rejects.toThrow("Access denied");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rolls back withdrawal if the draft copy cannot be created", async () => {
    mocks.tx.listingChange.createMany.mockRejectedValue(
      new Error("write failed"),
    );
    await expect(
      reopenListingRevisionForCorrection("submitted"),
    ).rejects.toThrow("write failed");
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("retains the existing rejected-revision correction flow", async () => {
    mocks.tx.listingRevision.findUniqueOrThrow.mockResolvedValue({
      ...original,
      status: "REJECTED",
    });
    await reviseListingRevision("submitted");
    expect(mocks.tx.listingChange.createMany).toHaveBeenCalled();
    expect(mocks.tx.listingRevision.update).not.toHaveBeenCalled();
  });
});
