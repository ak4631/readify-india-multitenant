"use server";

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

  return prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      category: true,
      address: true,
      verifications: { orderBy: { createdAt: "desc" } },
      createdBy: true,
      approvedBy: true,
      partner: {
        include: {
          users: { include: { roles: { include: { role: true } } } },
        },
      },
    },
  });
}

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

  await prisma.$transaction(async (tx) => {
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

export async function updateVendorAddress(
  vendorId: string,
  input: VendorAddressInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = vendorAddressSchema.parse(input);

  await prisma.$transaction(async (tx) => {
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
    const vendor = await tx.vendor.findUniqueOrThrow({
      where: { id: vendorId },
    });
    assertTransition(vendor.status, to);

    const updated = await tx.vendor.update({
      where: { id: vendorId },
      data: {
        status: to,
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
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${vendorId}`);
}

export async function submitVendorForReview(vendorId: string) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  await transitionVendor(
    vendorId,
    "SUBMITTED",
    session.user.id,
    "SUBMIT_VENDOR_FOR_REVIEW",
  );
  // Auto-advance straight to UNDER_REVIEW — there's no separate "intake queue" step in Phase 1.
  await transitionVendor(
    vendorId,
    "UNDER_REVIEW",
    session.user.id,
    "SUBMIT_VENDOR_FOR_REVIEW",
  );
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
