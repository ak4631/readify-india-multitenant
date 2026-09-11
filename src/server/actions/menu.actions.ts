"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireVendorAccess } from "@/lib/rbac";
import {
  menuCategorySchema,
  menuItemSchema,
  type MenuCategoryInput,
  type MenuItemInput,
} from "@/lib/validations/menu.schema";

export async function listMenu(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  return prisma.menuCategory.findMany({
    where: { vendorId },
    orderBy: { sortOrder: "asc" },
    include: { items: { orderBy: { name: "asc" } } },
  });
}

export async function createMenuCategory(
  vendorId: string,
  input: MenuCategoryInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = menuCategorySchema.parse(input);

  const category = await prisma.$transaction(async (tx) => {
    const count = await tx.menuCategory.count({ where: { vendorId } });
    const created = await tx.menuCategory.create({
      data: { ...data, vendorId, sortOrder: count },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_MENU_CATEGORY",
      entityType: "menu_category",
      entityId: created.id,
      newValue: created,
    });

    return created;
  });

  revalidatePath(`/vendors/${vendorId}`);
  return category;
}

export async function deleteMenuCategory(categoryId: string) {
  const record = await prisma.menuCategory.findUniqueOrThrow({
    where: { id: categoryId },
  });
  const session = await requireVendorAccess(record.vendorId, "vendor.update");

  const vendorId = await prisma.$transaction(async (tx) => {
    const before = await tx.menuCategory.findUniqueOrThrow({
      where: { id: categoryId },
    });
    await tx.menuCategory.delete({ where: { id: categoryId } });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "DELETE_MENU_CATEGORY",
      entityType: "menu_category",
      entityId: categoryId,
      oldValue: before,
    });

    return before.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function createMenuItem(
  vendorId: string,
  categoryId: string,
  input: MenuItemInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = menuItemSchema.parse(input);
  const category = await prisma.menuCategory.findFirst({
    where: { id: categoryId, vendorId },
  });
  if (!category)
    throw new Error("Menu category does not belong to this vendor");

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.menuItem.create({ data: { ...data, categoryId } });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_MENU_ITEM",
      entityType: "menu_item",
      entityId: created.id,
      newValue: created,
    });

    return created;
  });

  revalidatePath(`/vendors/${vendorId}`);
  return item;
}

export async function updateMenuItem(
  vendorId: string,
  itemId: string,
  input: MenuItemInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = menuItemSchema.parse(input);
  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, category: { vendorId } },
  });
  if (!item) throw new Error("Menu item does not belong to this vendor");

  await prisma.$transaction(async (tx) => {
    const before = await tx.menuItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    const after = await tx.menuItem.update({ where: { id: itemId }, data });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_MENU_ITEM",
      entityType: "menu_item",
      entityId: itemId,
      oldValue: before,
      newValue: after,
    });
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function deleteMenuItem(vendorId: string, itemId: string) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, category: { vendorId } },
  });
  if (!item) throw new Error("Menu item does not belong to this vendor");

  await prisma.$transaction(async (tx) => {
    const before = await tx.menuItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    await tx.menuItem.delete({ where: { id: itemId } });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "DELETE_MENU_ITEM",
      entityType: "menu_item",
      entityId: itemId,
      oldValue: before,
    });
  });

  revalidatePath(`/vendors/${vendorId}`);
}
