import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { queueListingChange } from "@/lib/listing-changes";
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));

describe("approved listing isolation", () => {
  const tx = {
    $queryRaw: vi.fn(),
    vendor: { findUniqueOrThrow: vi.fn() },
    listingChange: { findFirst: vi.fn(), create: vi.fn() },
  };
  const transaction = tx as unknown as Prisma.TransactionClient;
  beforeEach(() => {
    vi.clearAllMocks();
    tx.vendor.findUniqueOrThrow.mockResolvedValue({
      id: "vendor",
      status: "PUBLISHED",
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
    expect(tx.listingChange.create).toHaveBeenCalledWith({
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
    tx.listingChange.findFirst.mockResolvedValue({ id: "pending" });
    await expect(
      queueListingChange(
        transaction,
        "vendor",
        "owner",
        "PLAN_ARCHIVE",
        "plan",
        {},
      ),
    ).rejects.toThrow("already awaiting");
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
