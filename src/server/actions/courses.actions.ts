"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireVendorAccess } from "@/lib/rbac";
import {
  courseSchema,
  lectureSchema,
  type CourseInput,
  type LectureInput,
} from "@/lib/validations/academics.schema";

export async function listSubjects() {
  await requirePermission("vendor.read");
  return prisma.subject.findMany({ orderBy: { name: "asc" } });
}

export async function listCourses(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  return prisma.course.findMany({
    where: { vendorId },
    orderBy: { name: "asc" },
    include: {
      subject: true,
      teachers: { include: { teacher: true } },
      lectures: { orderBy: { startTime: "asc" } },
    },
  });
}

export async function createCourse(vendorId: string, input: CourseInput) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = courseSchema.parse(input);

  const course = await prisma.$transaction(async (tx) => {
    const created = await tx.course.create({
      data: {
        vendorId,
        name: data.name,
        description: data.description,
        subjectId: data.subjectId || undefined,
        price: data.price,
        durationValue: data.durationValue,
        durationUnit: data.durationUnit,
        mode: data.mode,
      },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_COURSE",
      entityType: "course",
      entityId: created.id,
      newValue: created,
    });

    return created;
  });

  revalidatePath(`/vendors/${vendorId}`);
  return course;
}

export async function updateCourse(courseId: string, input: CourseInput) {
  const record = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
  });
  const session = await requireVendorAccess(record.vendorId, "vendor.update");
  const data = courseSchema.parse(input);

  const vendorId = await prisma.$transaction(async (tx) => {
    const before = await tx.course.findUniqueOrThrow({
      where: { id: courseId },
    });
    const after = await tx.course.update({
      where: { id: courseId },
      data: {
        name: data.name,
        description: data.description,
        subjectId: data.subjectId || null,
        price: data.price,
        durationValue: data.durationValue,
        durationUnit: data.durationUnit,
        mode: data.mode,
      },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_COURSE",
      entityType: "course",
      entityId: courseId,
      oldValue: before,
      newValue: after,
    });

    return after.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function archiveCourse(courseId: string) {
  const record = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
  });
  const session = await requireVendorAccess(record.vendorId, "vendor.update");

  const vendorId = await prisma.$transaction(async (tx) => {
    const before = await tx.course.findUniqueOrThrow({
      where: { id: courseId },
    });
    const after = await tx.course.update({
      where: { id: courseId },
      data: { status: "ARCHIVED" },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "ARCHIVE_COURSE",
      entityType: "course",
      entityId: courseId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });

    return after.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function setCourseTeachers(
  courseId: string,
  teacherIds: string[],
) {
  const record = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
  });
  const session = await requireVendorAccess(record.vendorId, "vendor.update");
  const teacherCount = await prisma.teacher.count({
    where: { id: { in: teacherIds }, vendorId: record.vendorId },
  });
  if (teacherCount !== new Set(teacherIds).size) {
    throw new Error("Every teacher must belong to this vendor");
  }

  const vendorId = await prisma.$transaction(async (tx) => {
    const course = await tx.course.findUniqueOrThrow({
      where: { id: courseId },
    });
    await tx.courseTeacher.deleteMany({ where: { courseId } });
    if (teacherIds.length > 0) {
      await tx.courseTeacher.createMany({
        data: teacherIds.map((teacherId) => ({ courseId, teacherId })),
        skipDuplicates: true,
      });
    }

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_COURSE",
      entityType: "course",
      entityId: courseId,
      newValue: { teacherIds },
    });

    return course.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function createLecture(
  vendorId: string,
  courseId: string,
  input: LectureInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = lectureSchema.parse(input);
  const course = await prisma.course.findFirst({
    where: { id: courseId, vendorId },
  });
  if (!course) throw new Error("Course does not belong to this vendor");
  if (data.teacherId) {
    const teacher = await prisma.teacher.findFirst({
      where: { id: data.teacherId, vendorId },
    });
    if (!teacher) throw new Error("Teacher does not belong to this vendor");
  }

  const lecture = await prisma.$transaction(async (tx) => {
    const created = await tx.lecture.create({
      data: {
        courseId,
        teacherId: data.teacherId || undefined,
        title: data.title,
        description: data.description,
        mode: data.mode,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        meetingUrl: data.meetingUrl || undefined,
      },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_LECTURE",
      entityType: "lecture",
      entityId: created.id,
      newValue: created,
    });

    return created;
  });

  revalidatePath(`/vendors/${vendorId}`);
  return lecture;
}

export async function cancelLecture(vendorId: string, lectureId: string) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const lecture = await prisma.lecture.findFirst({
    where: { id: lectureId, course: { vendorId } },
  });
  if (!lecture) throw new Error("Lecture does not belong to this vendor");

  await prisma.$transaction(async (tx) => {
    const before = await tx.lecture.findUniqueOrThrow({
      where: { id: lectureId },
    });
    const after = await tx.lecture.update({
      where: { id: lectureId },
      data: { status: "CANCELLED" },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CANCEL_LECTURE",
      entityType: "lecture",
      entityId: lectureId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });
  });

  revalidatePath(`/vendors/${vendorId}`);
}
