"use server";

import { Prisma } from "@/generated/prisma/client";
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
  const courses = await prisma.course.findMany({
    where: { vendorId },
    orderBy: { name: "asc" },
    include: {
      subject: true,
      teachers: { include: { teacher: true } },
      lectures: { orderBy: { startTime: "asc" } },
    },
  });

  // Decimal (Course.price) is a class instance, not a plain object -- Next.js
  // refuses to pass it from this Server Action to a Client Component
  // (CoursesList/CourseDetailDialog receive this array as a prop).
  const changes = await editorChanges(vendorId);
  const teachers = await prisma.teacher.findMany({ where: { vendorId } });
  const proposed = overlayRows(courses, changes, "COURSE", {
    vendorId,
    subjectId: null,
    name: "",
    description: null,
    price: new Prisma.Decimal(0),
    durationValue: null,
    durationUnit: null,
    mode: "OFFLINE",
    status: "ACTIVE",
    subject: null,
    teachers: [],
    lectures: [],
  });
  for (const course of proposed)
    for (const c of changes) {
      const data = changeData(c);
      if (
        c.kind === "COURSE_TEACHERS" &&
        c.targetId === course.id &&
        Array.isArray(c.payload)
      )
        course.teachers = c.payload.map((id) => ({
          courseId: course.id,
          teacherId: String(id),
          teacher:
            teachers.find((t) => t.id === id) ??
            ({
              ...changeData(
                changes.find(
                  (ch) => ch.targetId === id && ch.kind === "TEACHER_CREATE",
                ) ?? { payload: {} },
              ),
              id: String(id),
              vendorId,
              status: "ACTIVE",
              bio: null,
              experienceYears: null,
              profilePhotoUrl: null,
              name: String(id),
            } as (typeof teachers)[number]),
        }));
      if (c.kind === "LECTURE_CREATE" && data.courseId === course.id) {
        const input = data.input as Record<string, unknown>;
        course.lectures.push({
          ...input,
          id: c.targetId,
          courseId: course.id,
          teacherId: input.teacherId || null,
          meetingUrl: input.meetingUrl || null,
          recordingUrl: null,
          status: "SCHEDULED",
          startTime: new Date(String(input.startTime)),
          endTime: new Date(String(input.endTime)),
        } as (typeof course.lectures)[number]);
      }
      if (c.kind === "LECTURE_CANCEL")
        course.lectures = course.lectures.map((l) =>
          l.id === c.targetId ? { ...l, status: "CANCELLED" } : l,
        );
    }
  return proposed.map((course) => ({ ...course, price: Number(course.price) }));
}

export type CourseRow = Awaited<ReturnType<typeof listCourses>>[number];

export async function createCourse(vendorId: string, input: CourseInput) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = courseSchema.parse(input);

  const course = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "COURSE_CREATE",
        randomUUID(),
        data,
      )
    )
      return;
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
  // Same Decimal-serialization reasoning as listCourses above -- this return
  // value is also consumed directly by the client caller.
  return course ? { ...course, price: Number(course.price) } : undefined;
}

export async function updateCourse(courseId: string, input: CourseInput) {
  const record =
    (await prisma.course.findUnique({ where: { id: courseId } })) ??
    (await proposedParent(courseId, "COURSE_CREATE"));
  const session = await requireVendorAccess(record.vendorId, "vendor.update");
  const data = courseSchema.parse(input);

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        record.vendorId,
        session.user.id,
        "COURSE_UPDATE",
        courseId,
        data,
      )
    )
      return record.vendorId;
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
  const record =
    (await prisma.course.findUnique({ where: { id: courseId } })) ??
    (await proposedParent(courseId, "COURSE_CREATE"));
  const session = await requireVendorAccess(record.vendorId, "vendor.update");

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        record.vendorId,
        session.user.id,
        "COURSE_ARCHIVE",
        courseId,
        {},
      )
    )
      return record.vendorId;
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
  const record =
    (await prisma.course.findUnique({ where: { id: courseId } })) ??
    (await proposedParent(courseId, "COURSE_CREATE"));
  const session = await requireVendorAccess(record.vendorId, "vendor.update");
  for (const teacherId of new Set(teacherIds)) {
    const teacher =
      (await prisma.teacher.findFirst({
        where: { id: teacherId, vendorId: record.vendorId },
      })) ?? (await proposedParent(teacherId, "TEACHER_CREATE"));
    if (teacher.vendorId !== record.vendorId)
      throw new Error("Every teacher must belong to this listing");
  }

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        record.vendorId,
        session.user.id,
        "COURSE_TEACHERS",
        courseId,
        teacherIds,
      )
    )
      return record.vendorId;
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
  const course =
    (await prisma.course.findFirst({ where: { id: courseId, vendorId } })) ??
    (await proposedParent(courseId, "COURSE_CREATE"));
  if (course.vendorId !== vendorId)
    throw new Error("Course does not belong to this listing");
  if (!course) throw new Error("Course does not belong to this vendor");
  if (data.teacherId) {
    const teacher =
      (await prisma.teacher.findFirst({
        where: { id: data.teacherId, vendorId },
      })) ?? (await proposedParent(data.teacherId, "TEACHER_CREATE"));
    if (teacher.vendorId !== vendorId)
      throw new Error("Teacher does not belong to this listing");
    if (!teacher) throw new Error("Teacher does not belong to this vendor");
  }

  const lecture = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "LECTURE_CREATE",
        randomUUID(),
        { courseId, input: data },
      )
    )
      return;
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
  const lecture =
    (await prisma.lecture.findFirst({
      where: { id: lectureId, course: { vendorId } },
    })) ?? (await proposedParent(lectureId, "LECTURE_CREATE"));
  if (!lecture) throw new Error("Lecture does not belong to this vendor");

  await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "LECTURE_CANCEL",
        lectureId,
        {},
      )
    )
      return;
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
