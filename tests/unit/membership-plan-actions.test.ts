import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { ListingChangeConflict } from "@/lib/listing-changes";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  queue: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  transaction: vi.fn(),
  reference: vi.fn(),
  tx: {
    membershipPlan: {
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}));
vi.mock("@/lib/rbac", () => ({ requireVendorAccess: mocks.access }));
vi.mock("@/lib/listing-changes", async (original) => ({
  ...(await original<typeof import("@/lib/listing-changes")>()),
  queueListingChange: mocks.queue,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    membershipPlan: { findUnique: mocks.reference },
  },
}));
import {
  createMembershipPlan,
  updateMembershipPlan,
} from "@/server/actions/membership-plans.actions";

const input = {
  name: "Prime",
  description: "",
  price: 1500,
  durationValue: 1,
  durationUnit: "MONTHS" as const,
  dailyHours: 6,
  dailyStart: "09:00",
  isFlexible: false,
};
const plan = {
  ...input,
  id: "plan",
  vendorId: "venue",
  price: new Prisma.Decimal(1500),
};

describe("plan saves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ user: { id: "owner" } });
    mocks.queue.mockResolvedValue(false);
    mocks.transaction.mockImplementation(async (cb) => cb(mocks.tx));
    mocks.reference.mockResolvedValue(plan);
    mocks.tx.membershipPlan.create.mockResolvedValue(plan);
    mocks.tx.membershipPlan.update.mockResolvedValue(plan);
    mocks.tx.membershipPlan.findUniqueOrThrow.mockResolvedValue(plan);
  });

  it("accepts the reported monthly-plan payload and returns client-safe data after a direct save", async () => {
    const result = await createMembershipPlan("venue", input);
    expect(result).toEqual({ ok: true, outcome: "saved" });
    expect(mocks.tx.membershipPlan.create).toHaveBeenCalledWith({
      data: { ...input, vendorId: "venue" },
    });
    expect(mocks.audit).toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/plans");
    expect(mocks.revalidate).toHaveBeenCalledWith("/vendors/venue");
  });

  it.each(["create", "update"])(
    "returns a draft outcome for a published listing during %s",
    async (operation) => {
      mocks.queue.mockResolvedValue(true);
      const result =
        operation === "create"
          ? await createMembershipPlan("venue", input)
          : await updateMembershipPlan("plan", input);
      expect(result).toEqual({ ok: true, outcome: "queued" });
      expect(mocks.tx.membershipPlan.create).not.toHaveBeenCalled();
      expect(mocks.tx.membershipPlan.update).not.toHaveBeenCalled();
    },
  );

  it.each(["create", "update"])(
    "returns review conflicts to the form instead of throwing during %s",
    async (operation) => {
      mocks.queue.mockRejectedValue(
        new ListingChangeConflict("Your revision is awaiting review."),
      );
      const result =
        operation === "create"
          ? await createMembershipPlan("venue", input)
          : await updateMembershipPlan("plan", input);
      expect(result).toEqual({
        ok: false,
        message: "Your revision is awaiting review.",
      });
      expect(mocks.revalidate).not.toHaveBeenCalled();
      expect(mocks.tx.membershipPlan.create).not.toHaveBeenCalled();
      expect(mocks.tx.membershipPlan.update).not.toHaveBeenCalled();
    },
  );

  it("returns invalid duration errors without starting a transaction", async () => {
    const result = await createMembershipPlan("venue", {
      ...input,
      durationValue: 12,
    });
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("monthly, quarterly or yearly"),
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("updates plans without returning a Prisma Decimal", async () => {
    expect(await updateMembershipPlan("plan", input)).toEqual({
      ok: true,
      outcome: "saved",
    });
    expect(mocks.tx.membershipPlan.update).toHaveBeenCalledWith({
      where: { id: "plan" },
      data: input,
    });
  });

  it("returns a support reference for unexpected failures without leaking database details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.transaction.mockRejectedValue(
        new Error("private database details"),
      );
      const result = await createMembershipPlan("venue", input);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected failure");
      const reference = result.message.match(
        /[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/,
      )?.[0];
      expect(reference).toBeTruthy();
      expect(result.message).not.toContain("private database details");
      expect(log).toHaveBeenCalledWith(
        "Membership plan save failed",
        expect.objectContaining({
          reference,
          operation: "create",
          vendorId: "venue",
        }),
      );
      expect(mocks.revalidate).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("does not write when access is denied", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.access.mockRejectedValue(new Error("Not authenticated"));
      expect((await createMembershipPlan("venue", input)).ok).toBe(false);
      expect(mocks.transaction).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
