"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/rbac";
import {
  suspendUserSchema,
  vendorAccountSchema,
  type VendorAccountInput,
} from "@/lib/validations/user.schema";

export async function createVendorAccount(input: VendorAccountInput) {
  const session = await requireSuperAdmin();
  const data = vendorAccountSchema.parse(input);
  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.findUniqueOrThrow({
      where: { id: data.vendorId },
    });
    const role = await tx.role.findUniqueOrThrow({
      where: { name: "PARTNER_ADMIN" },
    });
    const created = await tx.user.create({
      data: {
        partnerId: vendor.partnerId,
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
      },
    });
    await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_VENDOR_ACCOUNT",
      entityType: "user",
      entityId: created.id,
      newValue: {
        vendorId: data.vendorId,
        email: created.email,
        role: "PARTNER_ADMIN",
      },
    });
    return created;
  });

  revalidatePath(`/vendors/${data.vendorId}`);
  revalidatePath("/users");
  return { id: user.id, email: user.email };
}

export async function listUsers() {
  await requireSuperAdmin();

  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { roles: { include: { role: true } } },
  });
}

export async function getUserById(userId: string) {
  await requireSuperAdmin();

  return prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
}

export async function suspendUser(input: { userId: string }) {
  const session = await requireSuperAdmin();
  const { userId } = suspendUserSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId } });

    const after = await tx.user.update({
      where: { id: userId },
      data: { status: "SUSPENDED" },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "SUSPEND_USER",
      entityType: "user",
      entityId: userId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });
  });

  revalidatePath("/users");
}

export async function activateUser(input: { userId: string }) {
  const session = await requireSuperAdmin();
  const { userId } = suspendUserSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId } });

    const after = await tx.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "ACTIVATE_USER",
      entityType: "user",
      entityId: userId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });
  });

  revalidatePath("/users");
}
