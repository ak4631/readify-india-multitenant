"use server";

import { lockListing, queueListingChange } from "@/lib/listing-changes";
import { getRequiredDocuments } from "@/config/verification-requirements";
import { launchPlansReady } from "@/lib/launch-plans";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  getAccessibleVendorIds,
  isSuperAdmin,
  requirePermission,
  requireVendorAccess,
} from "@/lib/rbac";
import { slugify } from "@/lib/utils";
import { assertTransition } from "@/lib/vendor-lifecycle";
import {
  vendorAddressSchema,
  vendorBasicInfoSchema,
  type VendorAddressInput,
  type VendorBasicInfoInput,
} from "@/lib/validations/vendor.schema";
import {
  vendorCapacitySchema,
  type VendorCapacityInput,
} from "@/lib/validations/vendor-capacity.schema";
import type { VendorStatus } from "@/generated/prisma/enums";

export interface VendorFilters {
  categoryId?: string;
  status?: VendorStatus;
  city?: string;
}

export async function listVendors(filters: VendorFilters = {}) {
  const session = await requirePermission("vendor.read");
  const accessibleVendorIds = await getAccessibleVendorIds(session);

  return prisma.vendor.findMany({
    where: {
      id: accessibleVendorIds ? { in: accessibleVendorIds } : undefined,
      categoryId: filters.categoryId,
      status: filters.status,
      address: filters.city
        ? { city: { equals: filters.city, mode: "insensitive" } }
        : undefined,
    },
    orderBy: { createdAt: "desc" },
    include: { category: true, address: true },
  });
}

export async function getVendorById(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      category: true,
      address: true,
      verifications: { orderBy: { createdAt: "desc" } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      partner: {
        include: {
          users: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!vendor) return null;

  // Decimal (averageRating, address.latitude/longitude) is a class instance,
  // not a plain object -- Next.js refuses to pass it from this Server Action
  // to the many Client Components on the vendor detail page.
  return {
    ...vendor,
    averageRating: vendor.averageRating ? Number(vendor.averageRating) : null,
    address: vendor.address
      ? {
          ...vendor.address,
          latitude: vendor.address.latitude
            ? Number(vendor.address.latitude)
            : null,
          longitude: vendor.address.longitude
            ? Number(vendor.address.longitude)
            : null,
        }
      : vendor.address,
  };
}

export type VendorDetail = NonNullable<
  Awaited<ReturnType<typeof getVendorById>>
>;

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (await prisma.vendor.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function createVendorDraft(input: VendorBasicInfoInput) {
  const session = await requirePermission("vendor.create");
  const data = vendorBasicInfoSchema.parse(input);
  const category = await prisma.vendorCategory.findUniqueOrThrow({
    where: { id: data.categoryId },
  });
  if (!category.launchEnabled || category.status !== "ACTIVE")
    throw new Error(
      "This service is coming soon. Only active services can be onboarded.",
    );
  const slug = await uniqueSlug(data.name);
  const actor = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { partnerId: true },
  });
  const partnerId = isSuperAdmin(session) ? data.partnerId : actor.partnerId;
  if (!partnerId) throw new Error("A partner organization is required");
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner || partner.status !== "ACTIVE")
    throw new Error("Partner is not active");

  const vendor = await prisma.$transaction(async (tx) => {
    const created = await tx.vendor.create({
      data: {
        name: data.name,
        slug,
        partnerId,
        categoryId: data.categoryId,
        description: data.description || undefined,
        phone: data.phone,
        email: data.email || undefined,
        website: data.website || undefined,
        createdById: session.user.id,
      },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_VENDOR_DRAFT",
      entityType: "vendor",
      entityId: created.id,
      newValue: created,
    });

    return created;
  });

  revalidatePath("/vendors");
  return vendor;
}

export async function updateVendorProfile(
  vendorId: string,
  input: VendorBasicInfoInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = vendorBasicInfoSchema.parse(input);
  const existing = await prisma.vendor.findUniqueOrThrow({
    where: { id: vendorId },
    select: { categoryId: true },
  });
  if (existing.categoryId !== data.categoryId)
    throw new Error(
      "A listing's service cannot be changed. Create a separate listing instead.",
    );

  await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "PROFILE",
        vendorId,
        data,
      )
    )
      return;
    const before = await tx.vendor.findUniqueOrThrow({
      where: { id: vendorId },
    });

    const after = await tx.vendor.update({
      where: { id: vendorId },
      data: {
        name: data.name,
        categoryId: data.categoryId,
        description: data.description || null,
        phone: data.phone,
        email: data.email || null,
        website: data.website || null,
      },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_VENDOR_PROFILE",
      entityType: "vendor",
      entityId: vendorId,
      oldValue: before,
      newValue: after,
    });
  });

  revalidatePath(`/vendors/${vendorId}`);
}

// Owner-set capacity for categories without a per-seat model (gym, co-working-space,
// exam-hub). Library ignores this -- its capacity comes from LibrarySeat rows,
// so this is only meaningful/shown for other categories.
export async function updateVendorCapacity(
  vendorId: string,
  input: VendorCapacityInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = vendorCapacitySchema.parse(input);

  await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "CAPACITY",
        vendorId,
        data,
      )
    )
      return;
    const before = await tx.vendor.findUniqueOrThrow({
      where: { id: vendorId },
    });

    const after = await tx.vendor.update({
      where: { id: vendorId },
      data: { capacity: data.capacity },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_VENDOR_CAPACITY",
      entityType: "vendor",
      entityId: vendorId,
      oldValue: { capacity: before.capacity },
      newValue: { capacity: after.capacity },
    });
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function updateVendorAddress(
  vendorId: string,
  input: VendorAddressInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = vendorAddressSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "ADDRESS",
        vendorId,
        data,
      )
    )
      return;
    const address = await tx.vendorAddress.upsert({
      where: { vendorId },
      update: data,
      create: { ...data, vendorId },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_VENDOR_ADDRESS",
      entityType: "vendor",
      entityId: vendorId,
      newValue: address,
    });
  });

  revalidatePath(`/vendors/${vendorId}`);
}

async function transitionVendor(
  vendorId: string,
  to: VendorStatus,
  actorId: string,
  action: Parameters<typeof writeAuditLog>[1]["action"],
  extra?: {
    approvedById?: string;
    rejectionReason?: string | null;
    publishedAt?: Date;
  },
) {
  await prisma.$transaction(async (tx) => {
    const vendor = await lockListing(tx, vendorId);
    assertTransition(vendor.status, to);
    if (to === "APPROVED" || to === "PUBLISHED") {
      const category = await tx.vendorCategory.findUniqueOrThrow({
        where: { id: vendor.categoryId },
      });
      const partner = await tx.partner.findUniqueOrThrow({
        where: { id: vendor.partnerId },
      });
      if (
        !category.launchEnabled ||
        category.status !== "ACTIVE" ||
        partner.status !== "ACTIVE"
      )
        throw new Error("This partner or service is not active");
      const documents = await tx.vendorVerification.findMany({
        where: { vendorId, status: "VERIFIED" },
      });
      if (
        getRequiredDocuments(category.slug).some(
          (type) =>
            !documents.some((document) => document.documentType === type),
        )
      )
        throw new Error(
          "Verify all required documents before approving this listing",
        );
      if (to === "PUBLISHED") {
        const [address, seats, schedules, plans] = await Promise.all([
          tx.vendorAddress.findUnique({ where: { vendorId } }),
          tx.librarySeat.count({ where: { vendorId, isActive: true } }),
          tx.vendorSchedule.count({ where: { vendorId, isClosed: false } }),
          tx.membershipPlan.findMany({ where: { vendorId, status: "ACTIVE" } }),
        ]);
        if (
          !address ||
          address.latitude === null ||
          address.longitude === null ||
          !seats ||
          !schedules ||
          !launchPlansReady(plans)
        )
          throw new Error(
            "Configure a mapped address, seats, opening hours, Flex, monthly, quarterly and yearly plans before publishing",
          );
        for (const plan of plans.filter(
          (plan) => !plan.isFlexible && plan.dailyStart && plan.dailyHours,
        )) {
          const fit = await tx.$queryRaw<
            { fits: boolean }[]
          >`SELECT admin.slot_fits_schedule(${vendorId},(now() AT TIME ZONE ${vendor.timeZone})::date,${plan.dailyStart}::time,${plan.dailyHours}::int,${vendor.timeZone}) AS fits`;
          if (!fit[0]?.fits)
            throw new Error(
              `The daily window for ${plan.name} is outside your opening hours`,
            );
        }
      }
    }

    const updated = await tx.vendor.update({
      where: { id: vendorId },
      data: {
        status: to,
        verificationStatus: to === "APPROVED" ? "VERIFIED" : undefined,
        approvedById: extra?.approvedById,
        rejectionReason: extra?.rejectionReason,
        publishedAt: extra?.publishedAt,
      },
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action,
      entityType: "vendor",
      entityId: vendorId,
      oldValue: { status: vendor.status },
      newValue: { status: updated.status },
    });
    const recipients = await tx.user.findMany({
      where: { partnerId: vendor.partnerId, status: "ACTIVE" },
      select: { id: true },
    });
    if (recipients.length)
      await tx.portalNotification.createMany({
        data: recipients.map((user) => ({
          userId: user.id,
          title: `Listing ${to.toLowerCase().replaceAll("_", " ")}`,
          body: `${vendor.name}${extra?.rejectionReason ? `: ${extra.rejectionReason}` : ""}`,
          href: `/vendors/${vendorId}`,
        })),
      });
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${vendorId}`);
}

export async function submitVendorForReview(vendorId: string) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  await prisma.$transaction(async (tx) => {
    const vendor = await lockListing(tx, vendorId);
    assertTransition(vendor.status, "SUBMITTED");
    assertTransition("SUBMITTED", "UNDER_REVIEW");
    await tx.vendor.update({
      where: { id: vendorId },
      data: { status: "UNDER_REVIEW" },
    });
    for (const [from, to] of [
      [vendor.status, "SUBMITTED"],
      ["SUBMITTED", "UNDER_REVIEW"],
    ])
      await writeAuditLog(tx, {
        userId: session.user.id,
        action: "SUBMIT_VENDOR_FOR_REVIEW",
        entityType: "vendor",
        entityId: vendorId,
        oldValue: { status: from },
        newValue: { status: to },
      });
    const reviewers = await tx.user.findMany({
      where: {
        status: "ACTIVE",
        roles: { some: { role: { name: "SUPER_ADMIN" } } },
      },
      select: { id: true },
    });
    if (reviewers.length)
      await tx.portalNotification.createMany({
        data: reviewers.map((user) => ({
          userId: user.id,
          title: "Listing awaiting approval",
          body: vendor.name,
          href: `/vendors/${vendorId}`,
        })),
      });
  });
  revalidatePath("/vendors");
  revalidatePath(`/vendors/${vendorId}`);
}

export async function approveVendor(vendorId: string) {
  const session = await requirePermission("vendor.approve");
  await transitionVendor(
    vendorId,
    "APPROVED",
    session.user.id,
    "APPROVE_VENDOR",
    {
      approvedById: session.user.id,
    },
  );
}

export async function rejectVendor(vendorId: string, reason: string) {
  const session = await requirePermission("vendor.reject");
  await transitionVendor(
    vendorId,
    "REJECTED",
    session.user.id,
    "REJECT_VENDOR",
    {
      rejectionReason: reason,
    },
  );
}

export async function publishVendor(vendorId: string) {
  const session = await requirePermission("vendor.publish");
  await transitionVendor(
    vendorId,
    "PUBLISHED",
    session.user.id,
    "PUBLISH_VENDOR",
    {
      publishedAt: new Date(),
    },
  );
}

export async function suspendVendor(vendorId: string) {
  const session = await requirePermission("vendor.suspend");
  await transitionVendor(
    vendorId,
    "SUSPENDED",
    session.user.id,
    "SUSPEND_VENDOR",
  );
}

export async function reviseRejectedVendor(vendorId: string) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  await transitionVendor(
    vendorId,
    "DRAFT",
    session.user.id,
    "UPDATE_VENDOR_PROFILE",
    { rejectionReason: null },
  );
}

export async function requestListingReactivation(vendorId: string) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  await transitionVendor(
    vendorId,
    "UNDER_REVIEW",
    session.user.id,
    "SUBMIT_VENDOR_FOR_REVIEW",
  );
}
