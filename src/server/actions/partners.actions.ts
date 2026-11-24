"use server";

import { PublicActionError } from "@/lib/public-action-error";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  getCurrentSession,
  isPlatformStaff,
  requirePartnerAccess,
  requirePermission,
  requirePlatformPermission,
  requireSuperAdmin,
} from "@/lib/rbac";
import { pageWindow, toPage } from "@/lib/pagination";
import {
  partnerSchema,
  partnerUserSchema,
  partnerUserUpdateSchema,
  type PartnerInput,
  type PartnerUserInput,
  type PartnerUserUpdateInput,
} from "@/lib/validations/partner.schema";

async function local_listPartners(
  options: { page?: number; approval?: "PENDING" } = {},
) {
  const session = await requirePermission("partner.read");
  const scope = isPlatformStaff(session)
    ? {}
    : { users: { some: { id: session.user.id } } };
  const where = { ...scope, approvalStatus: options.approval };
  const window = pageWindow(options.page ?? 1);
  const [items, total, pending] = await Promise.all([
    prisma.partner.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: window.skip,
      take: window.take,
      include: { _count: { select: { users: true, vendors: true } } },
    }),
    prisma.partner.count({ where }),
    prisma.partner.count({ where: { ...scope, approvalStatus: "PENDING" } }),
  ]);
  return { ...toPage(items, total, window), pending };
}

async function local_getPartnerById(partnerId: string) {
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

async function local_listPartnerUsers(partnerId: string, page = 1) {
  await requirePartnerAccess(partnerId, "partnerUser.read");
  const where = { partnerId };
  const window = pageWindow(page);
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      omit: { passwordHash: true },
      include: { roles: { include: { role: true } } },
      orderBy: { name: "asc" },
      skip: window.skip,
      take: window.take,
    }),
    prisma.user.count({ where }),
  ]);
  return toPage(items, total, window);
}

// Platform view of the Team Members page: partner-side staff across every
// organization. Platform accounts themselves are managed under Users.
async function local_listAllPartnerUsers(page = 1) {
  await requirePlatformPermission("partnerUser.read");
  const where = { partnerId: { not: null } };
  const window = pageWindow(page);
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      omit: { passwordHash: true },
      include: {
        roles: { include: { role: true } },
        partner: { select: { id: true, name: true } },
      },
      orderBy: [{ partner: { name: "asc" } }, { name: "asc" }],
      skip: window.skip,
      take: window.take,
    }),
    prisma.user.count({ where }),
  ]);
  return toPage(items, total, window);
}

async function local_createPartner(input: PartnerInput) {
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

async function local_updatePartner(partnerId: string, input: PartnerInput) {
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

async function local_setPartnerActive(partnerId: string, active: boolean) {
  const session = await requireSuperAdmin();
  await prisma.$transaction(async (tx) => {
    const before = await tx.partner.findUniqueOrThrow({
      where: { id: partnerId },
    });
    if (active && before.approvalStatus !== "APPROVED")
      throw new PublicActionError(
        "Approve this application before activating the partner",
      );
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

async function local_createPartnerUser(input: PartnerUserInput) {
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

async function local_setPartnerUserActive(userId: string, active: boolean) {
  const actorSession = await getCurrentSession();
  if (!actorSession?.user) throw new PublicActionError("Not authenticated");
  if (actorSession.user.id === userId)
    throw new PublicActionError("You cannot deactivate your own account");
  const target = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      partnerId: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!target.partnerId)
    throw new PublicActionError("This is not a partner account");
  if (target.roles.some(({ role }) => role.name === "SUPER_ADMIN")) {
    throw new PublicActionError("Super admin accounts cannot be managed here");
  }
  const session = await requirePartnerAccess(
    target.partnerId,
    "partnerUser.status",
  );
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM admin.partners WHERE id=${target.partnerId} FOR UPDATE`;
    if (!active && target.roles.some((r) => r.role.name === "PARTNER_ADMIN")) {
      const owners = await tx.user.count({
        where: {
          partnerId: target.partnerId,
          status: "ACTIVE",
          id: { not: userId },
          roles: { some: { role: { name: "PARTNER_ADMIN" } } },
        },
      });
      if (!owners)
        throw new PublicActionError(
          "Add another active owner before deactivating the last partner owner",
        );
    }
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

async function local_updatePartnerUser(input: PartnerUserUpdateInput) {
  const data = partnerUserUpdateSchema.parse(input);
  const target = await prisma.user.findUniqueOrThrow({
    where: { id: data.userId },
    select: {
      partnerId: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!target.partnerId)
    throw new PublicActionError("This is not a partner account");
  if (target.roles.some(({ role }) => role.name === "SUPER_ADMIN")) {
    throw new PublicActionError("Super admin accounts cannot be managed here");
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

async function local_reviewPartnerApplication(
  partnerId: string,
  approve: boolean,
  reason?: string,
  expectedVersion?: number,
) {
  const session = await requireSuperAdmin();
  const decisionReason = approve
    ? null
    : z.string().trim().min(3).max(1000).parse(reason);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM admin.partners WHERE id=${partnerId} FOR UPDATE`;
    const before = await tx.partner.findUniqueOrThrow({
      where: { id: partnerId },
    });
    if (expectedVersion !== before.applicationVersion)
      throw new PublicActionError(
        "This application has changed. Reload before deciding.",
      );
    if (before.approvalStatus !== "PENDING")
      throw new PublicActionError("This application has already been reviewed");
    const service = before.requestedServiceId
      ? await tx.vendorCategory.findUnique({
          where: { id: before.requestedServiceId },
          select: { name: true },
        })
      : null;
    await tx.partner.update({
      where: { id: partnerId },
      data: {
        approvalStatus: approve ? "APPROVED" : "REJECTED",
        status: approve ? "ACTIVE" : "INACTIVE",
        applicationReason: decisionReason,
      },
    });
    await tx.portalNotification.create({
      data: {
        userId: before.createdById,
        title: approve
          ? "Partner application approved"
          : "Partner application rejected",
        body: approve
          ? `Your organization is active. You can now onboard ${service?.name ?? "your"} listings.`
          : decisionReason!,
        href: "/vendors",
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "REVIEW_PARTNER_APPLICATION",
      entityType: "partner",
      entityId: partnerId,
      newValue: {
        version: before.applicationVersion,
        approved: approve,
        reason: decisionReason,
      },
    });
  });
  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
}

export async function listPartners(
  ...args: Parameters<typeof local_listPartners>
): Promise<Awaited<ReturnType<typeof local_listPartners>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listPartners>>>(
      "partners.actions.listPartners",
      args,
    );
  }
  return local_listPartners(...args);
}

export async function getPartnerById(
  ...args: Parameters<typeof local_getPartnerById>
): Promise<Awaited<ReturnType<typeof local_getPartnerById>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getPartnerById>>>(
      "partners.actions.getPartnerById",
      args,
    );
  }
  return local_getPartnerById(...args);
}

export async function listPartnerUsers(
  ...args: Parameters<typeof local_listPartnerUsers>
): Promise<Awaited<ReturnType<typeof local_listPartnerUsers>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listPartnerUsers>>>(
      "partners.actions.listPartnerUsers",
      args,
    );
  }
  return local_listPartnerUsers(...args);
}

export async function listAllPartnerUsers(
  ...args: Parameters<typeof local_listAllPartnerUsers>
): Promise<Awaited<ReturnType<typeof local_listAllPartnerUsers>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listAllPartnerUsers>>>(
      "partners.actions.listAllPartnerUsers",
      args,
    );
  }
  return local_listAllPartnerUsers(...args);
}

export async function createPartner(
  ...args: Parameters<typeof local_createPartner>
): Promise<Awaited<ReturnType<typeof local_createPartner>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_createPartner>>>(
      "partners.actions.createPartner",
      args,
    );
  }
  return local_createPartner(...args);
}

export async function updatePartner(
  ...args: Parameters<typeof local_updatePartner>
): Promise<Awaited<ReturnType<typeof local_updatePartner>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_updatePartner>>>(
      "partners.actions.updatePartner",
      args,
    );
  }
  return local_updatePartner(...args);
}

export async function setPartnerActive(
  ...args: Parameters<typeof local_setPartnerActive>
): Promise<Awaited<ReturnType<typeof local_setPartnerActive>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_setPartnerActive>>>(
      "partners.actions.setPartnerActive",
      args,
    );
  }
  return local_setPartnerActive(...args);
}

export async function createPartnerUser(
  ...args: Parameters<typeof local_createPartnerUser>
): Promise<Awaited<ReturnType<typeof local_createPartnerUser>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_createPartnerUser>>>(
      "partners.actions.createPartnerUser",
      args,
    );
  }
  return local_createPartnerUser(...args);
}

export async function setPartnerUserActive(
  ...args: Parameters<typeof local_setPartnerUserActive>
): Promise<Awaited<ReturnType<typeof local_setPartnerUserActive>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_setPartnerUserActive>>>(
      "partners.actions.setPartnerUserActive",
      args,
    );
  }
  return local_setPartnerUserActive(...args);
}

export async function updatePartnerUser(
  ...args: Parameters<typeof local_updatePartnerUser>
): Promise<Awaited<ReturnType<typeof local_updatePartnerUser>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_updatePartnerUser>>>(
      "partners.actions.updatePartnerUser",
      args,
    );
  }
  return local_updatePartnerUser(...args);
}

export async function reviewPartnerApplication(
  ...args: Parameters<typeof local_reviewPartnerApplication>
): Promise<Awaited<ReturnType<typeof local_reviewPartnerApplication>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_reviewPartnerApplication>>
    >("partners.actions.reviewPartnerApplication", args);
  }
  return local_reviewPartnerApplication(...args);
}
