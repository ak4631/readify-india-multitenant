"use server";

import { PublicActionError } from "@/lib/public-action-error";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { pageWindow, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/rbac";
import {
  suspendUserSchema,
  vendorAccountSchema,
  type VendorAccountInput,
} from "@/lib/validations/user.schema";

async function local_createVendorAccount(input: VendorAccountInput) {
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

async function local_listUsers(page = 1) {
  await requireSuperAdmin();
  const window = pageWindow(page);
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      omit: { passwordHash: true },
      include: {
        roles: { include: { role: true } },
        partner: { select: { id: true, name: true } },
      },
      skip: window.skip,
      take: window.take,
    }),
    prisma.user.count(),
  ]);
  return toPage(items, total, window);
}

async function local_getUserById(userId: string) {
  await requireSuperAdmin();

  return prisma.user.findUnique({
    where: { id: userId },
    omit: { passwordHash: true },
    include: { roles: { include: { role: true } } },
  });
}

async function local_suspendUser(input: { userId: string }) {
  const session = await requireSuperAdmin();
  const { userId } = suspendUserSchema.parse(input);

  if (session.user.id === userId)
    throw new PublicActionError("You cannot suspend your own account");
  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (before.roles.some(({ role }) => role.name === "SUPER_ADMIN"))
      throw new PublicActionError(
        "Super Admin accounts cannot be suspended here",
      );
    if (before.partnerId) {
      await tx.$queryRaw`SELECT id FROM admin.partners WHERE id=${before.partnerId} FOR UPDATE`;
      if (before.roles.some(({ role }) => role.name === "PARTNER_ADMIN")) {
        const owners = await tx.user.count({
          where: {
            partnerId: before.partnerId,
            status: "ACTIVE",
            id: { not: userId },
            roles: { some: { role: { name: "PARTNER_ADMIN" } } },
          },
        });
        if (!owners)
          throw new PublicActionError(
            "Add another active owner before suspending the last partner owner",
          );
      }
    }

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

async function local_activateUser(input: { userId: string }) {
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

export async function createVendorAccount(
  ...args: Parameters<typeof local_createVendorAccount>
): Promise<Awaited<ReturnType<typeof local_createVendorAccount>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_createVendorAccount>>>(
      "users.actions.createVendorAccount",
      args,
    );
  }
  return local_createVendorAccount(...args);
}

export async function listUsers(
  ...args: Parameters<typeof local_listUsers>
): Promise<Awaited<ReturnType<typeof local_listUsers>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listUsers>>>(
      "users.actions.listUsers",
      args,
    );
  }
  return local_listUsers(...args);
}

export async function getUserById(
  ...args: Parameters<typeof local_getUserById>
): Promise<Awaited<ReturnType<typeof local_getUserById>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getUserById>>>(
      "users.actions.getUserById",
      args,
    );
  }
  return local_getUserById(...args);
}

export async function suspendUser(
  ...args: Parameters<typeof local_suspendUser>
): Promise<Awaited<ReturnType<typeof local_suspendUser>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_suspendUser>>>(
      "users.actions.suspendUser",
      args,
    );
  }
  return local_suspendUser(...args);
}

export async function activateUser(
  ...args: Parameters<typeof local_activateUser>
): Promise<Awaited<ReturnType<typeof local_activateUser>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_activateUser>>>(
      "users.actions.activateUser",
      args,
    );
  }
  return local_activateUser(...args);
}
