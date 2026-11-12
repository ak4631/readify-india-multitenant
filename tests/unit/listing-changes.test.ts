import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { listingSnapshot } from "@/lib/listing-snapshot";
import { queueListingChange } from "@/lib/listing-changes";
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/listing-snapshot", () => ({
  listingSnapshot: vi.fn(async () => ({ name: "Library" })),
}));

describe("approved listing isolation", () => {
  const tx = {
    $queryRaw: vi.fn(),
    vendor: { findUniqueOrThrow: vi.fn() },
    listingChange: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    listingRevision: { findFirst: vi.fn(), create: vi.fn() },
  };
  const transaction = tx as unknown as Prisma.TransactionClient;
  beforeEach(() => {
    vi.clearAllMocks();
    tx.vendor.findUniqueOrThrow.mockResolvedValue({
      id: "vendor",
      status: "PUBLISHED",
      contentVersion: 2,
      partnerId: "partner",
    });
    tx.listingRevision.findFirst.mockResolvedValue(null);
    tx.listingRevision.create.mockResolvedValue({
      id: "revision",
      status: "DRAFT",
    });
    tx.listingChange.findFirst.mockResolvedValue(null);
    tx.listingChange.create.mockResolvedValue({ id: "change" });
  });
  it("queues a proposed price instead of writing customer-facing plan data", async () => {
    expect(
      await queueListingChange(
        transaction,
        "vendor",
        "owner",
        "PLAN_UPDATE",
        "plan",
        { price: 200 },
      ),
    ).toBe(true);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.listingChange.findFirst).not.toHaveBeenCalled();
    expect(listingSnapshot).toHaveBeenCalledOnce();
    expect(writeAuditLog).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        partnerId: "partner",
        entityType: "listing_change",
        entityId: "change",
      }),
    );
    expect(tx.listingChange.create).toHaveBeenCalledWith({
      select: { id: true },
      data: expect.objectContaining({
        vendorId: "vendor",
        kind: "PLAN_UPDATE",
        targetId: "plan",
        payload: { price: 200 },
      }),
    });
  });
  it("freezes initial listing content during review", async () => {
    tx.vendor.findUniqueOrThrow.mockResolvedValue({ status: "UNDER_REVIEW" });
    await expect(
      queueListingChange(
        transaction,
        "vendor",
        "owner",
        "SCHEDULE",
        "vendor",
        {},
      ),
    ).rejects.toThrow("under review");
    expect(tx.listingChange.create).not.toHaveBeenCalled();
  });
  it("does not overwrite an earlier pending edit", async () => {
    tx.listingRevision.findFirst.mockResolvedValue({
      id: "pending",
      status: "PENDING",
    });
    await expect(
      queueListingChange(
        transaction,
        "vendor",
        "owner",
        "PLAN_ARCHIVE",
        "plan",
        {},
      ),
    ).rejects.toThrow("awaiting Super Admin");
    expect(tx.listingChange.create).not.toHaveBeenCalled();
  });
  it("updates an editable proposal without overwriting approved content", async () => {
    tx.listingRevision.findFirst.mockResolvedValue({
      id: "revision",
      status: "DRAFT",
    });
    tx.listingChange.findFirst.mockResolvedValue({ id: "change" });
    tx.listingChange.update.mockResolvedValue({ id: "change" });
    await queueListingChange(
      transaction,
      "vendor",
      "owner",
      "PLAN_UPDATE",
      "plan",
      { price: 300 },
    );
    expect(tx.listingChange.update).toHaveBeenCalledWith({
      where: { id: "change" },
      data: { payload: { price: 300 }, requestedBy: "owner" },
      select: { id: true },
    });
    expect(listingSnapshot).not.toHaveBeenCalled();
    expect(tx.listingRevision.create).not.toHaveBeenCalled();
    expect(tx.listingChange.create).not.toHaveBeenCalled();
  });
  it("allows draft setup without falsely queueing it as published content", async () => {
    tx.vendor.findUniqueOrThrow.mockResolvedValue({ status: "DRAFT" });
    expect(
      await queueListingChange(
        transaction,
        "vendor",
        "owner",
        "PROFILE",
        "vendor",
        {},
      ),
    ).toBe(false);
    expect(tx.listingChange.create).not.toHaveBeenCalled();
  });
});
