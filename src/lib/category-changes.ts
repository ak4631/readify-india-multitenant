import { PublicActionError } from "@/lib/public-action-error";
import { z } from "zod";
import { DocumentType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import {
  trainerSchema,
  trainerPricingSchema,
  trainerAvailabilitySchema,
} from "@/lib/validations/trainer.schema";
import {
  teacherSchema,
  courseSchema,
  lectureSchema,
} from "@/lib/validations/academics.schema";
import {
  menuCategorySchema,
  menuItemSchema,
} from "@/lib/validations/menu.schema";

export type CategoryChangeKind =
  | "TRAINER_CREATE"
  | "TRAINER_UPDATE"
  | "TRAINER_DEACTIVATE"
  | "TRAINER_SPECIALIZATIONS"
  | "TRAINER_PRICE_CREATE"
  | "TRAINER_PRICE_DELETE"
  | "TRAINER_AVAILABILITY"
  | "TEACHER_CREATE"
  | "TEACHER_UPDATE"
  | "TEACHER_DEACTIVATE"
  | "COURSE_CREATE"
  | "COURSE_UPDATE"
  | "COURSE_ARCHIVE"
  | "COURSE_TEACHERS"
  | "LECTURE_CREATE"
  | "LECTURE_CANCEL"
  | "MENU_CATEGORY_CREATE"
  | "MENU_CATEGORY_DELETE"
  | "MENU_ITEM_CREATE"
  | "MENU_ITEM_UPDATE"
  | "MENU_ITEM_DELETE"
  | "REVIEW_REPLY"
  | "DOCUMENT_CREATE";
export type ProposedChange = {
  kind: string;
  targetId: string;
  vendorId: string;
  payload: Prisma.JsonValue;
};
const ids = z
  .array(z.string().min(1).max(128))
  .max(200)
  .transform((v) => [...new Set(v)]);

export async function applyCategoryChange(
  tx: Prisma.TransactionClient,
  c: ProposedChange,
): Promise<boolean> {
  const target = { id: c.targetId, vendorId: c.vendorId };
  switch (c.kind) {
    case "TRAINER_CREATE":
      await tx.trainer.create({
        data: { ...trainerSchema.parse(c.payload), ...target },
      });
      break;
    case "TRAINER_UPDATE":
      await tx.trainer.update({
        where: target,
        data: trainerSchema.parse(c.payload),
      });
      break;
    case "TRAINER_DEACTIVATE":
      await tx.trainer.update({ where: target, data: { status: "INACTIVE" } });
      break;
    case "TRAINER_SPECIALIZATIONS": {
      await tx.trainer.findUniqueOrThrow({ where: target });
      const list = ids.parse(c.payload);
      if (
        (await tx.trainerSpecialization.count({
          where: { id: { in: list } },
        })) !== list.length
      )
        throw new PublicActionError("Unknown trainer specialization");
      await tx.trainerSpecializationMap.deleteMany({
        where: { trainerId: c.targetId },
      });
      if (list.length)
        await tx.trainerSpecializationMap.createMany({
          data: list.map((specializationId) => ({
            trainerId: c.targetId,
            specializationId,
          })),
        });
      break;
    }
    case "TRAINER_PRICE_CREATE": {
      const { trainerId, ...data } = z
        .object({ trainerId: z.string(), ...trainerPricingSchema.shape })
        .parse(c.payload);
      await tx.trainer.findUniqueOrThrow({
        where: { id: trainerId, vendorId: c.vendorId },
      });
      await tx.trainerPricing.create({
        data: { ...data, id: c.targetId, trainerId },
      });
      break;
    }
    case "TRAINER_PRICE_DELETE": {
      const row = await tx.trainerPricing.findFirstOrThrow({
        where: { id: c.targetId, trainer: { vendorId: c.vendorId } },
      });
      await tx.trainerPricing.delete({ where: { id: row.id } });
      break;
    }
    case "TRAINER_AVAILABILITY": {
      await tx.trainer.findUniqueOrThrow({ where: target });
      const slots = trainerAvailabilitySchema.parse(c.payload);
      await tx.trainerAvailability.deleteMany({
        where: { trainerId: c.targetId },
      });
      if (slots.length)
        await tx.trainerAvailability.createMany({
          data: slots.map((s) => ({
            ...s,
            trainerId: c.targetId,
            startTime: new Date("1970-01-01T" + s.startTime + ":00Z"),
            endTime: new Date("1970-01-01T" + s.endTime + ":00Z"),
          })),
        });
      break;
    }
    case "TEACHER_CREATE":
      await tx.teacher.create({
        data: { ...teacherSchema.parse(c.payload), ...target },
      });
      break;
    case "TEACHER_UPDATE":
      await tx.teacher.update({
        where: target,
        data: teacherSchema.parse(c.payload),
      });
      break;
    case "TEACHER_DEACTIVATE":
      await tx.teacher.update({ where: target, data: { status: "INACTIVE" } });
      break;
    case "COURSE_CREATE":
    case "COURSE_UPDATE": {
      const data = courseSchema.parse(c.payload);
      if (data.subjectId)
        await tx.subject.findUniqueOrThrow({ where: { id: data.subjectId } });
      const normalized = { ...data, subjectId: data.subjectId || null };
      if (c.kind === "COURSE_CREATE")
        await tx.course.create({ data: { ...normalized, ...target } });
      else await tx.course.update({ where: target, data: normalized });
      break;
    }
    case "COURSE_ARCHIVE":
      await tx.course.update({ where: target, data: { status: "ARCHIVED" } });
      break;
    case "COURSE_TEACHERS": {
      await tx.course.findUniqueOrThrow({ where: target });
      const list = ids.parse(c.payload);
      if (
        (await tx.teacher.count({
          where: { id: { in: list }, vendorId: c.vendorId },
        })) !== list.length
      )
        throw new PublicActionError("Teachers must belong to this listing");
      await tx.courseTeacher.deleteMany({ where: { courseId: c.targetId } });
      if (list.length)
        await tx.courseTeacher.createMany({
          data: list.map((teacherId) => ({ courseId: c.targetId, teacherId })),
        });
      break;
    }
    case "LECTURE_CREATE": {
      const payload = z
        .object({ courseId: z.string(), input: lectureSchema })
        .parse(c.payload);
      await tx.course.findUniqueOrThrow({
        where: { id: payload.courseId, vendorId: c.vendorId },
      });
      const data = payload.input;
      if (data.teacherId)
        await tx.teacher.findUniqueOrThrow({
          where: { id: data.teacherId, vendorId: c.vendorId },
        });
      await tx.lecture.create({
        data: {
          ...data,
          id: c.targetId,
          courseId: payload.courseId,
          teacherId: data.teacherId || null,
          meetingUrl: data.meetingUrl || null,
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime),
        },
      });
      break;
    }
    case "LECTURE_CANCEL": {
      await tx.lecture.findFirstOrThrow({
        where: { id: c.targetId, course: { vendorId: c.vendorId } },
      });
      await tx.lecture.update({
        where: { id: c.targetId },
        data: { status: "CANCELLED" },
      });
      break;
    }
    case "MENU_CATEGORY_CREATE":
      await tx.menuCategory.create({
        data: { ...menuCategorySchema.parse(c.payload), ...target },
      });
      break;
    case "MENU_CATEGORY_DELETE":
      await tx.menuCategory.delete({ where: target });
      break;
    case "MENU_ITEM_CREATE": {
      const payload = z
        .object({ categoryId: z.string(), input: menuItemSchema })
        .parse(c.payload);
      await tx.menuCategory.findUniqueOrThrow({
        where: { id: payload.categoryId, vendorId: c.vendorId },
      });
      await tx.menuItem.create({
        data: {
          ...payload.input,
          id: c.targetId,
          categoryId: payload.categoryId,
        },
      });
      break;
    }
    case "MENU_ITEM_UPDATE":
    case "MENU_ITEM_DELETE": {
      await tx.menuItem.findFirstOrThrow({
        where: { id: c.targetId, category: { vendorId: c.vendorId } },
      });
      if (c.kind === "MENU_ITEM_UPDATE")
        await tx.menuItem.update({
          where: { id: c.targetId },
          data: menuItemSchema.parse(c.payload),
        });
      else await tx.menuItem.delete({ where: { id: c.targetId } });
      break;
    }
    case "REVIEW_REPLY": {
      const data = z
        .object({ reply: z.string().trim().min(1).max(2000) })
        .parse(c.payload);
      await tx.review.update({
        where: { ...target, status: "PUBLISHED" },
        data: { ownerReply: data.reply, repliedAt: new Date() },
      });
      break;
    }
    case "DOCUMENT_CREATE": {
      const data = z
        .object({
          documentType: z.enum(DocumentType),
          documentUrl: z.string().min(1).max(4096),
          documentNumber: z.string().optional(),
        })
        .parse(c.payload);
      await tx.vendorVerification.create({ data: { ...data, ...target } });
      break;
    }
    default:
      return false;
  }
  return true;
}
