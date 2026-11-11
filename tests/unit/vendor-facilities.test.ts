import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  queue: vi.fn(),
  audit: vi.fn(),
  invalidate: vi.fn(),
  transaction: vi.fn(),
  tx: {
    facility: { findMany: vi.fn() },
    vendorFacility: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@/lib/rbac", () => ({ requireVendorAccess: mocks.access }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.invalidate }));
vi.mock("@/lib/listing-changes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/listing-changes")>()),
  queueListingChange: mocks.queue,
}));
import { ListingChangeConflict } from "@/lib/listing-changes";
import { setVendorFacilities } from "@/server/actions/vendor-facilities.actions";

describe("facilities persistence and approval isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ user: { id: "owner" } });
    mocks.transaction.mockImplementation(async (callback) =>
      callback(mocks.tx),
    );
    mocks.tx.facility.findMany.mockResolvedValue([{ id: "wifi" }]);
    mocks.tx.vendorFacility.findMany.mockResolvedValue([]);
    mocks.queue.mockResolvedValue(false);
  });

  it("saves validated draft facilities and deduplicates selected IDs", async () => {
    expect(await setVendorFacilities("listing", ["wifi", "wifi"])).toEqual({
      ok: true,
      outcome: "saved",
      facilityIds: ["wifi"],
    });
    expect(mocks.tx.vendorFacility.createMany).toHaveBeenCalledWith({
      data: [{ vendorId: "listing", facilityId: "wifi" }],
      skipDuplicates: true,
    });
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(
      "/vendors/listing",
    );
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it("queues a live change without touching approved facilities", async () => {
    mocks.queue.mockResolvedValue(true);
    expect(await setVendorFacilities("listing", ["wifi"])).toMatchObject({
      ok: true,
      outcome: "queued",
    });
    expect(mocks.tx.vendorFacility.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.vendorFacility.createMany).not.toHaveBeenCalled();
  });

  it("supports explicitly clearing facilities on a draft", async () => {
    mocks.tx.facility.findMany.mockResolvedValue([]);
    expect(await setVendorFacilities("listing", [])).toEqual({
      ok: true,
      outcome: "saved",
      facilityIds: [],
    });
    expect(mocks.tx.vendorFacility.deleteMany).toHaveBeenCalledWith({
      where: { vendorId: "listing" },
    });
    expect(mocks.tx.vendorFacility.createMany).not.toHaveBeenCalled();
  });

  it("rejects unavailable IDs before queueing or deleting anything", async () => {
    mocks.tx.facility.findMany.mockResolvedValue([]);
    expect(await setVendorFacilities("listing", ["inactive"])).toMatchObject({
      ok: false,
    });
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.tx.vendorFacility.deleteMany).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("returns expected review conflicts without hiding them behind a production exception", async () => {
    mocks.queue.mockRejectedValue(
      new ListingChangeConflict("Listing is under review"),
    );
    expect(await setVendorFacilities("listing", ["wifi"])).toEqual({
      ok: false,
      message: "Listing is under review",
    });
    expect(mocks.tx.vendorFacility.deleteMany).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads and cross-tenant access before mutation", async () => {
    expect(await setVendorFacilities("", ["wifi"])).toMatchObject({
      ok: false,
    });
    expect(
      await setVendorFacilities("listing", Array(201).fill("wifi")),
    ).toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.access.mockRejectedValue(new Error("Access denied"));
    await expect(setVendorFacilities("other-tenant", ["wifi"])).rejects.toThrow(
      "Access denied",
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("propagates unexpected database failures and never reports success", async () => {
    mocks.tx.vendorFacility.deleteMany.mockRejectedValueOnce(
      new Error("Database failure"),
    );
    await expect(setVendorFacilities("listing", ["wifi"])).rejects.toThrow(
      "Database failure",
    );
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
