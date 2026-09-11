import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertTransition } from "../../src/lib/vendor-lifecycle";

// Exercises the real admin-schema Prisma models end-to-end (create draft -> submit
// -> under review -> approve), the same sequence vendors.actions.ts drives, without
// going through the Server Actions themselves (those need a Next.js request scope
// for requirePermission()/headers()). Runs against the live "admin" schema and
// cleans up its own rows.
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

describe("vendor onboarding sequence", () => {
  let categoryId: string;
  let userId: string;
  let vendorId: string;
  let partnerId: string;

  beforeAll(async () => {
    const category = await prisma.vendorCategory.findFirstOrThrow({
      where: { slug: "library" },
    });
    categoryId = category.id;

    const admin = await prisma.user.findFirstOrThrow({
      where: { roles: { some: { role: { name: "SUPER_ADMIN" } } } },
    });
    userId = admin.id;
    const partner = await prisma.partner.create({
      data: {
        name: "Integration Test Partner",
        createdById: userId,
      },
    });
    partnerId = partner.id;
  });

  afterAll(async () => {
    if (vendorId) {
      await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => {});
    }
    if (partnerId) {
      await prisma.partner.delete({ where: { id: partnerId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("creates a draft, submits it, and approves it", async () => {
    const vendor = await prisma.vendor.create({
      data: {
        name: "Integration Test Library",
        slug: `integration-test-library-${Date.now()}`,
        categoryId,
        partnerId,
        phone: "9999999999",
        createdById: userId,
      },
    });
    vendorId = vendor.id;
    expect(vendor.status).toBe("DRAFT");

    assertTransition(vendor.status, "SUBMITTED");
    const submitted = await prisma.vendor.update({
      where: { id: vendor.id },
      data: { status: "SUBMITTED" },
    });
    expect(submitted.status).toBe("SUBMITTED");

    assertTransition(submitted.status, "UNDER_REVIEW");
    const underReview = await prisma.vendor.update({
      where: { id: vendor.id },
      data: { status: "UNDER_REVIEW" },
    });
    expect(underReview.status).toBe("UNDER_REVIEW");

    assertTransition(underReview.status, "APPROVED");
    const approved = await prisma.vendor.update({
      where: { id: vendor.id },
      data: { status: "APPROVED", approvedById: userId },
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(userId);
  });

  it("rejects an out-of-order transition", () => {
    expect(() => assertTransition("DRAFT", "APPROVED")).toThrow();
  });
});
