"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { slugify } from "@/lib/utils";
import {
  vendorCategorySchema,
  type VendorCategoryInput,
} from "@/lib/validations/vendor-category.schema";

export async function listVendorCategories() {
  await requirePermission("vendorCategory.read");

  return prisma.vendorCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { vendors: true } } },
  });
}

export async function createVendorCategory(input: VendorCategoryInput) {
  const session = await requirePermission("vendorCategory.create");
  const data = vendorCategorySchema.parse(input);
  const slug = slugify(data.name);

  const category = await prisma.$transaction(async (tx) => {
    const created = await tx.vendorCategory.create({
      data: { ...data, slug },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_VENDOR_CATEGORY",
      entityType: "vendor_category",
      entityId: created.id,
      newValue: created,
    });

    return created;
  });

  revalidatePath("/vendor-categories");
  return category;
}

export async function updateVendorCategory(
  categoryId: string,
  input: VendorCategoryInput,
) {
  const session = await requirePermission("vendorCategory.update");
  const data = vendorCategorySchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const before = await tx.vendorCategory.findUniqueOrThrow({
      where: { id: categoryId },
    });

    const after = await tx.vendorCategory.update({
      where: { id: categoryId },
      data,
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_VENDOR_CATEGORY",
      entityType: "vendor_category",
      entityId: categoryId,
      oldValue: before,
      newValue: after,
    });
  });

  revalidatePath("/vendor-categories");
}

// Categories are FK'd from vendors, so "delete" is always a soft-delete —
// existing vendors keep their reference, the category just drops off active pickers.
export async function deactivateVendorCategory(categoryId: string) {
  const session = await requirePermission("vendorCategory.delete");

  await prisma.$transaction(async (tx) => {
    const before = await tx.vendorCategory.findUniqueOrThrow({
      where: { id: categoryId },
    });

    const after = await tx.vendorCategory.update({
      where: { id: categoryId },
      data: { status: "INACTIVE" },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "DEACTIVATE_VENDOR_CATEGORY",
      entityType: "vendor_category",
      entityId: categoryId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });
  });

  revalidatePath("/vendor-categories");
}
