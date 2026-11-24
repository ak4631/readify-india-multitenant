"use server";

import {
  editorChanges,
  overlayRows,
  proposedParent,
} from "@/lib/listing-editor";
import { randomUUID } from "node:crypto";
import { queueListingChange } from "@/lib/listing-changes";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireVendorAccess } from "@/lib/rbac";
import {
  teacherSchema,
  type TeacherInput,
} from "@/lib/validations/academics.schema";

async function local_listTeachers(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  const rows = await prisma.teacher.findMany({
    where: { vendorId },
    orderBy: { name: "asc" },
  });
  return overlayRows(rows, await editorChanges(vendorId), "TEACHER", {
    vendorId,
    name: "",
    bio: null,
    experienceYears: null,
    profilePhotoUrl: null,
    status: "ACTIVE",
  });
}

async function local_createTeacher(vendorId: string, input: TeacherInput) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = teacherSchema.parse(input);

  const teacher = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "TEACHER_CREATE",
        randomUUID(),
        data,
      )
    )
      return;
    const created = await tx.teacher.create({ data: { ...data, vendorId } });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_TEACHER",
      entityType: "teacher",
      entityId: created.id,
      newValue: created,
    });

    return created;
  });

  revalidatePath(`/vendors/${vendorId}`);
  return teacher;
}

async function local_updateTeacher(teacherId: string, input: TeacherInput) {
  const record =
    (await prisma.teacher.findUnique({ where: { id: teacherId } })) ??
    (await proposedParent(teacherId, "TEACHER_CREATE"));
  const session = await requireVendorAccess(record.vendorId, "vendor.update");
  const data = teacherSchema.parse(input);

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        record.vendorId,
        session.user.id,
        "TEACHER_UPDATE",
        teacherId,
        data,
      )
    )
      return record.vendorId;
    const before = await tx.teacher.findUniqueOrThrow({
      where: { id: teacherId },
    });
    const after = await tx.teacher.update({ where: { id: teacherId }, data });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_TEACHER",
      entityType: "teacher",
      entityId: teacherId,
      oldValue: before,
      newValue: after,
    });

    return after.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

async function local_deactivateTeacher(teacherId: string) {
  const record =
    (await prisma.teacher.findUnique({ where: { id: teacherId } })) ??
    (await proposedParent(teacherId, "TEACHER_CREATE"));
  const session = await requireVendorAccess(record.vendorId, "vendor.update");

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        record.vendorId,
        session.user.id,
        "TEACHER_DEACTIVATE",
        teacherId,
        {},
      )
    )
      return record.vendorId;
    const before = await tx.teacher.findUniqueOrThrow({
      where: { id: teacherId },
    });
    const after = await tx.teacher.update({
      where: { id: teacherId },
      data: { status: "INACTIVE" },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "DEACTIVATE_TEACHER",
      entityType: "teacher",
      entityId: teacherId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });

    return after.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function listTeachers(
  ...args: Parameters<typeof local_listTeachers>
): Promise<Awaited<ReturnType<typeof local_listTeachers>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listTeachers>>>(
      "teachers.actions.listTeachers",
      args,
    );
  }
  return local_listTeachers(...args);
}

export async function createTeacher(
  ...args: Parameters<typeof local_createTeacher>
): Promise<Awaited<ReturnType<typeof local_createTeacher>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_createTeacher>>>(
      "teachers.actions.createTeacher",
      args,
    );
  }
  return local_createTeacher(...args);
}

export async function updateTeacher(
  ...args: Parameters<typeof local_updateTeacher>
): Promise<Awaited<ReturnType<typeof local_updateTeacher>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_updateTeacher>>>(
      "teachers.actions.updateTeacher",
      args,
    );
  }
  return local_updateTeacher(...args);
}

export async function deactivateTeacher(
  ...args: Parameters<typeof local_deactivateTeacher>
): Promise<Awaited<ReturnType<typeof local_deactivateTeacher>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_deactivateTeacher>>>(
      "teachers.actions.deactivateTeacher",
      args,
    );
  }
  return local_deactivateTeacher(...args);
}
