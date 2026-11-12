"use server";

import { PublicActionError } from "@/lib/public-action-error";

import { editorChanges, changeData } from "@/lib/listing-editor";
import { lockListing, queueListingChange } from "@/lib/listing-changes";
import { assertReady, getReadiness } from "@/lib/listing-readiness";
import { listingSnapshot, snapshotDigest } from "@/lib/listing-snapshot";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { pageWindow, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import {
  getAccessibleVendorIds,
  isSuperAdmin,
  requirePermission,
  requireSuperAdminPermission,
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
  partnerId?: string;
  categoryId?: string;
  status?: VendorStatus;
  city?: string;
}

async function vendorWhere(filters: VendorFilters & { categorySlug?: string }) {
  const session = await requirePermission("vendor.read");
  const accessibleVendorIds = await getAccessibleVendorIds(
    session,
    filters.partnerId,
  );
  return {
    id: accessibleVendorIds ? { in: accessibleVendorIds } : undefined,
    categoryId: filters.categoryId || undefined,
    category: filters.categorySlug ? { slug: filters.categorySlug } : undefined,
    status: filters.status || undefined,
    address: filters.city
      ? { city: { equals: filters.city, mode: "insensitive" as const } }
      : undefined,
  };
}

export async function listVendors(filters: VendorFilters = {}) {
  return prisma.vendor.findMany({
    where: await vendorWhere(filters),
    orderBy: { createdAt: "desc" },
    include: { category: true, address: true },
  });
}

export async function listVendorsPage(
  filters: VendorFilters & {
    categorySlug?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const where = await vendorWhere(filters);
  const window = pageWindow(filters.page ?? 1, filters.pageSize);
  const [items, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { category: true, address: true },
      skip: window.skip,
      take: window.take,
    }),
    prisma.vendor.count({ where }),
  ]);
  return toPage(items, total, window);
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

  const proposals = await editorChanges(vendorId);
  for (const change of proposals) {
    const data = changeData(change);
    if (change.kind === "PROFILE")
      Object.assign(vendor, {
        name: data.name,
        description: data.description ?? null,
        phone: data.phone,
        email: data.email ?? null,
        website: data.website ?? null,
      });
    if (change.kind === "CAPACITY")
      vendor.capacity = data.capacity as number | null;
    if (change.kind === "ADDRESS")
      vendor.address = { ...vendor.address, ...data } as typeof vendor.address;
  }
  // Decimal (averageRating, address.latitude/longitude) is a class instance,
  // not a plain object -- Next.js refuses to pass it from this Server Action
  // to the many Client Components on the vendor detail page.
  return {
    ...vendor,
    averageRating: vendor.averageRating ? Number(vendor.averageRating) : null,
    address: vendor.address
      ? {
          ...vendor.address,
          latitude:
            vendor.address.latitude !== null &&
            vendor.address.latitude !== undefined
              ? Number(vendor.address.latitude)
              : null,
          longitude:
            vendor.address.longitude !== null &&
            vendor.address.longitude !== undefined
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
    throw new PublicActionError(
      "This service is coming soon. Only active services can be onboarded.",
    );
  const slug = await uniqueSlug(data.name);
  const actor = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { partnerId: true },
  });
  const partnerId = isSuperAdmin(session) ? data.partnerId : actor.partnerId;
  if (!partnerId)
    throw new PublicActionError("A partner organization is required");
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner || partner.status !== "ACTIVE")
    throw new PublicActionError("Partner is not active");

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
    throw new PublicActionError(
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
    expectedVersion?: number;
  },
) {
  await prisma.$transaction(async (tx) => {
    const vendor = await lockListing(tx, vendorId);
    assertTransition(vendor.status, to);
    if (["APPROVED", "REJECTED", "PUBLISHED"].includes(to)) {
      if (
        extra?.expectedVersion !== vendor.submissionVersion ||
        (!vendor.submissionVersion && to !== "PUBLISHED")
      )
        throw new PublicActionError(
          "Reload this listing before reviewing its current submission.",
        );
      if (vendor.submissionVersion > 0) {
        const submission = await tx.listingSubmission.findUniqueOrThrow({
          where: {
            vendorId_version: { vendorId, version: vendor.submissionVersion },
          },
        });
        if (to !== "PUBLISHED") {
          if (submission.status !== "PENDING")
            throw new PublicActionError(
              "This submission has already been decided",
            );
          if (
            submission.digest !==
            snapshotDigest(await listingSnapshot(tx, vendorId))
          )
            throw new PublicActionError(
              "Submitted content has changed. Request a new submission before approving.",
            );
          await tx.listingSubmission.update({
            where: { id: submission.id },
            data: {
              status: to,
              reviewedBy: actorId,
              reviewedAt: new Date(),
              reason: extra?.rejectionReason ?? null,
            },
          });
        } else if (submission.status !== "APPROVED")
          throw new PublicActionError("An approved submission is required");
      }
    }
    if (to === "APPROVED" || to === "PUBLISHED") {
      assertReady(await getReadiness(tx, vendorId, true));
      if (
        to === "PUBLISHED" &&
        (await tx.listingRevision.count({
          where: { vendorId, status: { in: ["DRAFT", "PENDING"] } },
        }))
      )
        throw new PublicActionError(
          "Finish or withdraw pending changes before first publication",
        );
    }

    const updated = await tx.vendor.update({
      where: { id: vendorId },
      data: {
        contentVersion: to === "APPROVED" ? { increment: 1 } : undefined,
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
    if (!["DRAFT", "SUSPENDED", "UNDER_REVIEW"].includes(vendor.status))
      throw new PublicActionError(
        "This listing cannot be submitted from its current state",
      );
    if (vendor.status === "UNDER_REVIEW" && vendor.submissionVersion > 0)
      throw new PublicActionError("This listing is already under review");
    assertReady(await getReadiness(tx, vendorId));
    const snapshot = await listingSnapshot(tx, vendorId);
    await tx.listingSubmission.create({
      data: {
        vendorId,
        version: vendor.submissionVersion + 1,
        snapshot,
        digest: snapshotDigest(snapshot),
        requestedBy: session.user.id,
      },
    });
    assertTransition("SUBMITTED", "UNDER_REVIEW");
    await tx.vendor.update({
      where: { id: vendorId },
      data: { status: "UNDER_REVIEW", submissionVersion: { increment: 1 } },
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

export async function approveVendor(vendorId: string, expectedVersion: number) {
  const session = await requireSuperAdminPermission("vendor.approve");
  await transitionVendor(
    vendorId,
    "APPROVED",
    session.user.id,
    "APPROVE_VENDOR",
    {
      approvedById: session.user.id,
      expectedVersion,
    },
  );
}

export async function rejectVendor(
  vendorId: string,
  reason: string,
  expectedVersion: number,
) {
  const session = await requireSuperAdminPermission("vendor.reject");
  await transitionVendor(
    vendorId,
    "REJECTED",
    session.user.id,
    "REJECT_VENDOR",
    {
      rejectionReason:
        reason.trim().length >= 3
          ? reason.trim()
          : (() => {
              throw new PublicActionError(
                "Provide a rejection reason of at least 3 characters",
              );
            })(),
      expectedVersion,
    },
  );
}

export async function publishVendor(vendorId: string, expectedVersion: number) {
  const session = await requireSuperAdminPermission("vendor.publish");
  await transitionVendor(
    vendorId,
    "PUBLISHED",
    session.user.id,
    "PUBLISH_VENDOR",
    {
      publishedAt: new Date(),
      expectedVersion,
    },
  );
}

export async function suspendVendor(vendorId: string) {
  const session = await requireSuperAdminPermission("vendor.suspend");
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
  await submitVendorForReview(vendorId);
}
export async function getListingReadiness(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  return getReadiness(prisma, vendorId);
}

export async function reopenLegacyListing(vendorId: string) {
  const session = await requireSuperAdminPermission("vendor.reject");
  await prisma.$transaction(async (tx) => {
    const vendor = await lockListing(tx, vendorId);
    if (
      !["SUBMITTED", "UNDER_REVIEW"].includes(vendor.status) ||
      vendor.submissionVersion !== 0
    )
      throw new PublicActionError(
        "This action is only for legacy unversioned reviews",
      );
    await tx.vendor.update({
      where: { id: vendorId },
      data: { status: "DRAFT" },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "REJECT_VENDOR",
      entityType: "vendor",
      entityId: vendorId,
      newValue: {
        status: "DRAFT",
        reason: "Legacy review returned for complete versioned setup",
      },
    });
  });
  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/dashboard");
}
