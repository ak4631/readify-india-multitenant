"use server";

import { PublicActionError } from "@/lib/public-action-error";

import {
  editorChanges,
  overlayRows,
  proposedParent,
  changeData,
} from "@/lib/listing-editor";
import { randomUUID } from "node:crypto";
import { queueListingChange } from "@/lib/listing-changes";

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

async function local_listMenu(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  const categories = await prisma.menuCategory.findMany({
    where: { vendorId },
    orderBy: { sortOrder: "asc" },
    include: { items: { orderBy: { name: "asc" } } },
  });

  // Decimal (MenuItem.price) is a class instance, not a plain object --
  // Next.js refuses to pass it from this Server Action to a Client Component
  // (MenuEditor receives this array as a prop).
  const changes = await editorChanges(vendorId);
  const proposed = overlayRows(categories, changes, "MENU_CATEGORY", {
    vendorId,
    name: "",
    sortOrder: 0,
    items: [],
  });
  for (const cat of proposed)
    for (const c of changes) {
      const d = changeData(c);
      if (c.kind === "MENU_ITEM_CREATE" && d.categoryId === cat.id)
        cat.items.push({
          ...(d.input as object),
          id: c.targetId,
          categoryId: cat.id,
          imageUrl: null,
        } as (typeof cat.items)[number]);
      if (c.kind === "MENU_ITEM_UPDATE")
        cat.items = cat.items.map((i) =>
          i.id === c.targetId ? { ...i, ...d } : i,
        );
      if (c.kind === "MENU_ITEM_DELETE")
        cat.items = cat.items.filter((i) => i.id !== c.targetId);
    }
  return proposed.map((category) => ({
    ...category,
    items: category.items.map((item) => ({
      ...item,
      price: Number(item.price),
    })),
  }));
}

export type MenuCategoryRow = Awaited<ReturnType<typeof listMenu>>[number];

async function local_createMenuCategory(
  vendorId: string,
  input: MenuCategoryInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = menuCategorySchema.parse(input);

  const category = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "MENU_CATEGORY_CREATE",
        randomUUID(),
        data,
      )
    )
      return;
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

async function local_deleteMenuCategory(categoryId: string) {
  const record =
    (await prisma.menuCategory.findUnique({ where: { id: categoryId } })) ??
    (await proposedParent(categoryId, "MENU_CATEGORY_CREATE"));
  const session = await requireVendorAccess(record.vendorId, "vendor.update");

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        record.vendorId,
        session.user.id,
        "MENU_CATEGORY_DELETE",
        categoryId,
        {},
      )
    )
      return record.vendorId;
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

async function local_createMenuItem(
  vendorId: string,
  categoryId: string,
  input: MenuItemInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = menuItemSchema.parse(input);
  const category =
    (await prisma.menuCategory.findFirst({
      where: { id: categoryId, vendorId },
    })) ?? (await proposedParent(categoryId, "MENU_CATEGORY_CREATE"));
  if (category.vendorId !== vendorId)
    throw new PublicActionError("Category does not belong to this listing");
  if (!category)
    throw new PublicActionError("Menu category does not belong to this vendor");

  const item = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "MENU_ITEM_CREATE",
        randomUUID(),
        { categoryId, input: data },
      )
    )
      return;
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
  // Same Decimal-serialization reasoning as listMenu above -- this return
  // value is also consumed directly by the client caller.
  return item ? { ...item, price: Number(item.price) } : undefined;
}

async function local_updateMenuItem(
  vendorId: string,
  itemId: string,
  input: MenuItemInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = menuItemSchema.parse(input);
  const item =
    (await prisma.menuItem.findFirst({
      where: { id: itemId, category: { vendorId } },
    })) ?? (await proposedParent(itemId, "MENU_ITEM_CREATE"));
  if ("vendorId" in item && item.vendorId !== vendorId)
    throw new PublicActionError("Item does not belong to this listing");
  if (!item)
    throw new PublicActionError("Menu item does not belong to this vendor");

  await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "MENU_ITEM_UPDATE",
        itemId,
        data,
      )
    )
      return;
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

async function local_deleteMenuItem(vendorId: string, itemId: string) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const item =
    (await prisma.menuItem.findFirst({
      where: { id: itemId, category: { vendorId } },
    })) ?? (await proposedParent(itemId, "MENU_ITEM_CREATE"));
  if ("vendorId" in item && item.vendorId !== vendorId)
    throw new PublicActionError("Item does not belong to this listing");
  if (!item)
    throw new PublicActionError("Menu item does not belong to this vendor");

  await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "MENU_ITEM_DELETE",
        itemId,
        {},
      )
    )
      return;
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

export async function listMenu(
  ...args: Parameters<typeof local_listMenu>
): Promise<Awaited<ReturnType<typeof local_listMenu>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listMenu>>>(
      "menu.actions.listMenu",
      args,
    );
  }
  return local_listMenu(...args);
}

export async function createMenuCategory(
  ...args: Parameters<typeof local_createMenuCategory>
): Promise<Awaited<ReturnType<typeof local_createMenuCategory>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_createMenuCategory>>>(
      "menu.actions.createMenuCategory",
      args,
    );
  }
  return local_createMenuCategory(...args);
}

export async function deleteMenuCategory(
  ...args: Parameters<typeof local_deleteMenuCategory>
): Promise<Awaited<ReturnType<typeof local_deleteMenuCategory>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_deleteMenuCategory>>>(
      "menu.actions.deleteMenuCategory",
      args,
    );
  }
  return local_deleteMenuCategory(...args);
}

export async function createMenuItem(
  ...args: Parameters<typeof local_createMenuItem>
): Promise<Awaited<ReturnType<typeof local_createMenuItem>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_createMenuItem>>>(
      "menu.actions.createMenuItem",
      args,
    );
  }
  return local_createMenuItem(...args);
}

export async function updateMenuItem(
  ...args: Parameters<typeof local_updateMenuItem>
): Promise<Awaited<ReturnType<typeof local_updateMenuItem>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_updateMenuItem>>>(
      "menu.actions.updateMenuItem",
      args,
    );
  }
  return local_updateMenuItem(...args);
}

export async function deleteMenuItem(
  ...args: Parameters<typeof local_deleteMenuItem>
): Promise<Awaited<ReturnType<typeof local_deleteMenuItem>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_deleteMenuItem>>>(
      "menu.actions.deleteMenuItem",
      args,
    );
  }
  return local_deleteMenuItem(...args);
}
