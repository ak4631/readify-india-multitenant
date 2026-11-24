"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { pageWindow, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { slugify } from "@/lib/utils";
import {
  vendorCategorySchema,
  type VendorCategoryInput,
} from "@/lib/validations/vendor-category.schema";

async function local_listVendorCategories() {
  await requirePermission("vendorCategory.read");

  return prisma.vendorCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { vendors: true } } },
  });
}

async function local_listVendorCategoriesPage(page = 1) {
  await requirePermission("vendorCategory.read");
  const window = pageWindow(page);
  const [items, total] = await Promise.all([
    prisma.vendorCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { vendors: true } } },
      skip: window.skip,
      take: window.take,
    }),
    prisma.vendorCategory.count(),
  ]);
  return toPage(items, total, window);
}

async function local_createVendorCategory(input: VendorCategoryInput) {
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

async function local_updateVendorCategory(
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
async function local_deactivateVendorCategory(categoryId: string) {
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

export async function listVendorCategories(
  ...args: Parameters<typeof local_listVendorCategories>
): Promise<Awaited<ReturnType<typeof local_listVendorCategories>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listVendorCategories>>>(
      "vendor-categories.actions.listVendorCategories",
      args,
    );
  }
  return local_listVendorCategories(...args);
}

export async function listVendorCategoriesPage(
  ...args: Parameters<typeof local_listVendorCategoriesPage>
): Promise<Awaited<ReturnType<typeof local_listVendorCategoriesPage>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_listVendorCategoriesPage>>
    >("vendor-categories.actions.listVendorCategoriesPage", args);
  }
  return local_listVendorCategoriesPage(...args);
}

export async function createVendorCategory(
  ...args: Parameters<typeof local_createVendorCategory>
): Promise<Awaited<ReturnType<typeof local_createVendorCategory>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_createVendorCategory>>>(
      "vendor-categories.actions.createVendorCategory",
      args,
    );
  }
  return local_createVendorCategory(...args);
}

export async function updateVendorCategory(
  ...args: Parameters<typeof local_updateVendorCategory>
): Promise<Awaited<ReturnType<typeof local_updateVendorCategory>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_updateVendorCategory>>>(
      "vendor-categories.actions.updateVendorCategory",
      args,
    );
  }
  return local_updateVendorCategory(...args);
}

export async function deactivateVendorCategory(
  ...args: Parameters<typeof local_deactivateVendorCategory>
): Promise<Awaited<ReturnType<typeof local_deactivateVendorCategory>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_deactivateVendorCategory>>
    >("vendor-categories.actions.deactivateVendorCategory", args);
  }
  return local_deactivateVendorCategory(...args);
}
