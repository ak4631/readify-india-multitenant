"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireVendorAccess } from "@/lib/rbac";
import {
  teacherSchema,
  type TeacherInput,
} from "@/lib/validations/academics.schema";

export async function listTeachers(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  return prisma.teacher.findMany({
    where: { vendorId },
    orderBy: { name: "asc" },
  });
}

export async function createTeacher(vendorId: string, input: TeacherInput) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = teacherSchema.parse(input);

  const teacher = await prisma.$transaction(async (tx) => {
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

export async function updateTeacher(teacherId: string, input: TeacherInput) {
  const record = await prisma.teacher.findUniqueOrThrow({
    where: { id: teacherId },
  });
  const session = await requireVendorAccess(record.vendorId, "vendor.update");
  const data = teacherSchema.parse(input);

  const vendorId = await prisma.$transaction(async (tx) => {
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

export async function deactivateTeacher(teacherId: string) {
  const record = await prisma.teacher.findUniqueOrThrow({
    where: { id: teacherId },
  });
  const session = await requireVendorAccess(record.vendorId, "vendor.update");

  const vendorId = await prisma.$transaction(async (tx) => {
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
