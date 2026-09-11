"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  getCurrentSession,
  isSuperAdmin,
  requirePartnerAccess,
  requirePermission,
  requireSuperAdmin,
} from "@/lib/rbac";
import {
  partnerSchema,
  partnerUserSchema,
  partnerUserUpdateSchema,
  type PartnerInput,
  type PartnerUserInput,
  type PartnerUserUpdateInput,
} from "@/lib/validations/partner.schema";

export async function listPartners() {
  const session = await requirePermission("partner.read");
  const where = isSuperAdmin(session)
    ? undefined
    : { users: { some: { id: session.user.id } } };
  return prisma.partner.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true, vendors: true } } },
  });
}

export async function getPartnerById(partnerId: string) {
  await requirePartnerAccess(partnerId, "partner.read");
  return prisma.partner.findUnique({
    where: { id: partnerId },
    include: {
      vendors: {
        include: { category: true, address: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function listPartnerUsers(partnerId: string) {
  await requirePartnerAccess(partnerId, "partnerUser.read");
  return prisma.user.findMany({
    where: { partnerId },
    include: { roles: { include: { role: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createPartner(input: PartnerInput) {
  const session = await requireSuperAdmin();
  const data = partnerSchema.parse(input);
  const partner = await prisma.$transaction(async (tx) => {
    const created = await tx.partner.create({
      data: {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        createdById: session.user.id,
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_PARTNER",
      entityType: "partner",
      entityId: created.id,
      newValue: created,
    });
    return created;
  });
  revalidatePath("/partners");
  return partner;
}

export async function updatePartner(partnerId: string, input: PartnerInput) {
  const session = await requirePartnerAccess(partnerId, "partner.update");
  const data = partnerSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const before = await tx.partner.findUniqueOrThrow({
      where: { id: partnerId },
    });
    const after = await tx.partner.update({
      where: { id: partnerId },
      data: {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_PARTNER",
      entityType: "partner",
      entityId: partnerId,
      oldValue: before,
      newValue: after,
    });
  });
  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
}

export async function setPartnerActive(partnerId: string, active: boolean) {
  const session = await requireSuperAdmin();
  await prisma.$transaction(async (tx) => {
    const before = await tx.partner.findUniqueOrThrow({
      where: { id: partnerId },
    });
    const after = await tx.partner.update({
      where: { id: partnerId },
      data: { status: active ? "ACTIVE" : "INACTIVE" },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: active ? "ACTIVATE_PARTNER" : "DEACTIVATE_PARTNER",
      entityType: "partner",
      entityId: partnerId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });
  });
  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
}

export async function createPartnerUser(input: PartnerUserInput) {
  const data = partnerUserSchema.parse(input);
  const permission =
    data.role === "PARTNER_ADMIN"
      ? "partnerUser.createAdmin"
      : "partnerUser.createEmployee";
  const session = await requirePartnerAccess(data.partnerId, permission);
  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({
      where: { name: data.role },
    });
    const created = await tx.user.create({
      data: {
        partnerId: data.partnerId,
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
      },
    });
    await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_PARTNER_USER",
      entityType: "user",
      entityId: created.id,
      newValue: {
        partnerId: data.partnerId,
        role: data.role,
        email: created.email,
      },
    });
    return created;
  });
  revalidatePath(`/partners/${data.partnerId}`);
  revalidatePath("/users");
  return { id: user.id, email: user.email };
}

export async function setPartnerUserActive(userId: string, active: boolean) {
  const actorSession = await getCurrentSession();
  if (!actorSession?.user) throw new Error("Not authenticated");
  if (actorSession.user.id === userId)
    throw new Error("You cannot deactivate your own account");
  const target = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      partnerId: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!target.partnerId) throw new Error("This is not a partner account");
  if (target.roles.some(({ role }) => role.name === "SUPER_ADMIN")) {
    throw new Error("Super admin accounts cannot be managed here");
  }
  const session = await requirePartnerAccess(
    target.partnerId,
    "partnerUser.status",
  );
  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const after = await tx.user.update({
      where: { id: userId },
      data: { status: active ? "ACTIVE" : "SUSPENDED" },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: active ? "ACTIVATE_PARTNER_USER" : "DEACTIVATE_PARTNER_USER",
      entityType: "user",
      entityId: userId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });
  });
  revalidatePath(`/partners/${target.partnerId}`);
}

export async function updatePartnerUser(input: PartnerUserUpdateInput) {
  const data = partnerUserUpdateSchema.parse(input);
  const target = await prisma.user.findUniqueOrThrow({
    where: { id: data.userId },
    select: {
      partnerId: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!target.partnerId) throw new Error("This is not a partner account");
  if (target.roles.some(({ role }) => role.name === "SUPER_ADMIN")) {
    throw new Error("Super admin accounts cannot be managed here");
  }
  const session = await requirePartnerAccess(
    target.partnerId,
    "partnerUser.update",
  );
  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({
      where: { id: data.userId },
    });
    const after = await tx.user.update({
      where: { id: data.userId },
      data: { name: data.name, email: data.email.toLowerCase() },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_PARTNER_USER",
      entityType: "user",
      entityId: data.userId,
      oldValue: { name: before.name, email: before.email },
      newValue: { name: after.name, email: after.email },
    });
  });
  revalidatePath(`/partners/${target.partnerId}`);
}
