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
  q?: string;
}

async function vendorWhere(filters: VendorFilters & { categorySlug?: string }) {
  const session = await requirePermission("vendor.read");
  const accessibleVendorIds = await getAccessibleVendorIds(
    session,
    filters.partnerId,
  );
  return {
    id: accessibleVendorIds ? { in: accessibleVendorIds } : undefined,
    name: filters.q
      ? { contains: filters.q.trim(), mode: "insensitive" as const }
      : undefined,
    categoryId: filters.categoryId || undefined,
    category: filters.categorySlug ? { slug: filters.categorySlug } : undefined,
    status: filters.status || undefined,
    address: filters.city
      ? { city: { equals: filters.city, mode: "insensitive" as const } }
      : undefined,
  };
}

async function local_listVendors(filters: VendorFilters = {}) {
  return prisma.vendor.findMany({
    where: await vendorWhere(filters),
    orderBy: { createdAt: "desc" },
    include: { category: true, address: true },
  });
}

async function local_listVendorsPage(
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

async function local_getVendorById(vendorId: string) {
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

async function local_createVendorDraft(input: VendorBasicInfoInput) {
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

async function local_updateVendorProfile(
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
async function local_updateVendorCapacity(
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

async function local_updateVendorAddress(
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

async function local_submitVendorForReview(vendorId: string) {
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

async function local_approveVendor(vendorId: string, expectedVersion: number) {
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

async function local_rejectVendor(
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

async function local_publishVendor(vendorId: string, expectedVersion: number) {
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

async function local_suspendVendor(vendorId: string) {
  const session = await requireSuperAdminPermission("vendor.suspend");
  await transitionVendor(
    vendorId,
    "SUSPENDED",
    session.user.id,
    "SUSPEND_VENDOR",
  );
}

async function local_reviseRejectedVendor(vendorId: string) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  await transitionVendor(
    vendorId,
    "DRAFT",
    session.user.id,
    "UPDATE_VENDOR_PROFILE",
    { rejectionReason: null },
  );
}

async function local_requestListingReactivation(vendorId: string) {
  await submitVendorForReview(vendorId);
}
async function local_getListingReadiness(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  return getReadiness(prisma, vendorId);
}

async function local_reopenLegacyListing(vendorId: string) {
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

export async function listVendors(
  ...args: Parameters<typeof local_listVendors>
): Promise<Awaited<ReturnType<typeof local_listVendors>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listVendors>>>(
      "vendors.actions.listVendors",
      args,
    );
  }
  return local_listVendors(...args);
}

export async function listVendorsPage(
  ...args: Parameters<typeof local_listVendorsPage>
): Promise<Awaited<ReturnType<typeof local_listVendorsPage>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listVendorsPage>>>(
      "vendors.actions.listVendorsPage",
      args,
    );
  }
  return local_listVendorsPage(...args);
}

export async function getVendorById(
  ...args: Parameters<typeof local_getVendorById>
): Promise<Awaited<ReturnType<typeof local_getVendorById>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getVendorById>>>(
      "vendors.actions.getVendorById",
      args,
    );
  }
  return local_getVendorById(...args);
}

export async function createVendorDraft(
  ...args: Parameters<typeof local_createVendorDraft>
): Promise<Awaited<ReturnType<typeof local_createVendorDraft>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_createVendorDraft>>>(
      "vendors.actions.createVendorDraft",
      args,
    );
  }
  return local_createVendorDraft(...args);
}

export async function updateVendorProfile(
  ...args: Parameters<typeof local_updateVendorProfile>
): Promise<Awaited<ReturnType<typeof local_updateVendorProfile>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_updateVendorProfile>>>(
      "vendors.actions.updateVendorProfile",
      args,
    );
  }
  return local_updateVendorProfile(...args);
}

export async function updateVendorCapacity(
  ...args: Parameters<typeof local_updateVendorCapacity>
): Promise<Awaited<ReturnType<typeof local_updateVendorCapacity>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_updateVendorCapacity>>>(
      "vendors.actions.updateVendorCapacity",
      args,
    );
  }
  return local_updateVendorCapacity(...args);
}

export async function updateVendorAddress(
  ...args: Parameters<typeof local_updateVendorAddress>
): Promise<Awaited<ReturnType<typeof local_updateVendorAddress>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_updateVendorAddress>>>(
      "vendors.actions.updateVendorAddress",
      args,
    );
  }
  return local_updateVendorAddress(...args);
}

export async function submitVendorForReview(
  ...args: Parameters<typeof local_submitVendorForReview>
): Promise<Awaited<ReturnType<typeof local_submitVendorForReview>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_submitVendorForReview>>>(
      "vendors.actions.submitVendorForReview",
      args,
    );
  }
  return local_submitVendorForReview(...args);
}

export async function approveVendor(
  ...args: Parameters<typeof local_approveVendor>
): Promise<Awaited<ReturnType<typeof local_approveVendor>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_approveVendor>>>(
      "vendors.actions.approveVendor",
      args,
    );
  }
  return local_approveVendor(...args);
}

export async function rejectVendor(
  ...args: Parameters<typeof local_rejectVendor>
): Promise<Awaited<ReturnType<typeof local_rejectVendor>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_rejectVendor>>>(
      "vendors.actions.rejectVendor",
      args,
    );
  }
  return local_rejectVendor(...args);
}

export async function publishVendor(
  ...args: Parameters<typeof local_publishVendor>
): Promise<Awaited<ReturnType<typeof local_publishVendor>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_publishVendor>>>(
      "vendors.actions.publishVendor",
      args,
    );
  }
  return local_publishVendor(...args);
}

export async function suspendVendor(
  ...args: Parameters<typeof local_suspendVendor>
): Promise<Awaited<ReturnType<typeof local_suspendVendor>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_suspendVendor>>>(
      "vendors.actions.suspendVendor",
      args,
    );
  }
  return local_suspendVendor(...args);
}

export async function reviseRejectedVendor(
  ...args: Parameters<typeof local_reviseRejectedVendor>
): Promise<Awaited<ReturnType<typeof local_reviseRejectedVendor>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_reviseRejectedVendor>>>(
      "vendors.actions.reviseRejectedVendor",
      args,
    );
  }
  return local_reviseRejectedVendor(...args);
}

export async function requestListingReactivation(
  ...args: Parameters<typeof local_requestListingReactivation>
): Promise<Awaited<ReturnType<typeof local_requestListingReactivation>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_requestListingReactivation>>
    >("vendors.actions.requestListingReactivation", args);
  }
  return local_requestListingReactivation(...args);
}

export async function getListingReadiness(
  ...args: Parameters<typeof local_getListingReadiness>
): Promise<Awaited<ReturnType<typeof local_getListingReadiness>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getListingReadiness>>>(
      "vendors.actions.getListingReadiness",
      args,
    );
  }
  return local_getListingReadiness(...args);
}

export async function reopenLegacyListing(
  ...args: Parameters<typeof local_reopenLegacyListing>
): Promise<Awaited<ReturnType<typeof local_reopenLegacyListing>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_reopenLegacyListing>>>(
      "vendors.actions.reopenLegacyListing",
      args,
    );
  }
  return local_reopenLegacyListing(...args);
}
