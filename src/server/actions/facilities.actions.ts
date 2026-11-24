"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { pageWindow, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  facilitySchema,
  type FacilityInput,
} from "@/lib/validations/facility.schema";

async function local_listFacilities() {
  await requirePermission("facility.read");

  return prisma.facility.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { vendorFacilities: true } } },
  });
}

async function local_listFacilitiesPage(page = 1) {
  await requirePermission("facility.read");
  const window = pageWindow(page);
  const [items, total] = await Promise.all([
    prisma.facility.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { vendorFacilities: true } } },
      skip: window.skip,
      take: window.take,
    }),
    prisma.facility.count(),
  ]);
  return toPage(items, total, window);
}

async function local_createFacility(input: FacilityInput) {
  const session = await requirePermission("facility.create");
  const data = facilitySchema.parse(input);

  const facility = await prisma.$transaction(async (tx) => {
    const created = await tx.facility.create({ data });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_FACILITY",
      entityType: "facility",
      entityId: created.id,
      newValue: created,
    });

    return created;
  });

  revalidatePath("/facilities");
  return facility;
}

async function local_updateFacility(facilityId: string, input: FacilityInput) {
  const session = await requirePermission("facility.update");
  const data = facilitySchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const before = await tx.facility.findUniqueOrThrow({
      where: { id: facilityId },
    });
    const after = await tx.facility.update({ where: { id: facilityId }, data });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_FACILITY",
      entityType: "facility",
      entityId: facilityId,
      oldValue: before,
      newValue: after,
    });
  });

  revalidatePath("/facilities");
}

// Facilities are FK'd from vendor_facilities, so "delete" is a soft-delete —
// existing vendor mappings keep working, the facility just drops off active pickers.
async function local_deactivateFacility(facilityId: string) {
  const session = await requirePermission("facility.delete");

  await prisma.$transaction(async (tx) => {
    const before = await tx.facility.findUniqueOrThrow({
      where: { id: facilityId },
    });
    const after = await tx.facility.update({
      where: { id: facilityId },
      data: { status: "INACTIVE" },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "DEACTIVATE_FACILITY",
      entityType: "facility",
      entityId: facilityId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });
  });

  revalidatePath("/facilities");
}

export async function listFacilities(
  ...args: Parameters<typeof local_listFacilities>
): Promise<Awaited<ReturnType<typeof local_listFacilities>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listFacilities>>>(
      "facilities.actions.listFacilities",
      args,
    );
  }
  return local_listFacilities(...args);
}

export async function listFacilitiesPage(
  ...args: Parameters<typeof local_listFacilitiesPage>
): Promise<Awaited<ReturnType<typeof local_listFacilitiesPage>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listFacilitiesPage>>>(
      "facilities.actions.listFacilitiesPage",
      args,
    );
  }
  return local_listFacilitiesPage(...args);
}

export async function createFacility(
  ...args: Parameters<typeof local_createFacility>
): Promise<Awaited<ReturnType<typeof local_createFacility>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_createFacility>>>(
      "facilities.actions.createFacility",
      args,
    );
  }
  return local_createFacility(...args);
}

export async function updateFacility(
  ...args: Parameters<typeof local_updateFacility>
): Promise<Awaited<ReturnType<typeof local_updateFacility>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_updateFacility>>>(
      "facilities.actions.updateFacility",
      args,
    );
  }
  return local_updateFacility(...args);
}

export async function deactivateFacility(
  ...args: Parameters<typeof local_deactivateFacility>
): Promise<Awaited<ReturnType<typeof local_deactivateFacility>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_deactivateFacility>>>(
      "facilities.actions.deactivateFacility",
      args,
    );
  }
  return local_deactivateFacility(...args);
}
