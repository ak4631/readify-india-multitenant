"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireVendorAccess } from "@/lib/rbac";
import {
  trainerAvailabilitySlotSchema,
  trainerPricingSchema,
  trainerSchema,
  type TrainerAvailabilitySlotInput,
  type TrainerInput,
  type TrainerPricingInput,
} from "@/lib/validations/trainer.schema";

function toTime(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

export async function listTrainers(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  return prisma.trainer.findMany({
    where: { vendorId },
    orderBy: { createdAt: "asc" },
    include: {
      specializations: { include: { specialization: true } },
      pricing: true,
      availability: true,
    },
  });
}

export async function listTrainerSpecializations() {
  await requirePermission("vendor.read");
  return prisma.trainerSpecialization.findMany({ orderBy: { name: "asc" } });
}

export async function createTrainer(vendorId: string, input: TrainerInput) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = trainerSchema.parse(input);

  const trainer = await prisma.$transaction(async (tx) => {
    const created = await tx.trainer.create({ data: { ...data, vendorId } });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_TRAINER",
      entityType: "trainer",
      entityId: created.id,
      newValue: created,
    });

    return created;
  });

  revalidatePath(`/vendors/${vendorId}`);
  return trainer;
}

export async function updateTrainer(trainerId: string, input: TrainerInput) {
  const record = await prisma.trainer.findUniqueOrThrow({
    where: { id: trainerId },
  });
  const session = await requireVendorAccess(record.vendorId, "vendor.update");
  const data = trainerSchema.parse(input);

  const vendorId = await prisma.$transaction(async (tx) => {
    const before = await tx.trainer.findUniqueOrThrow({
      where: { id: trainerId },
    });
    const after = await tx.trainer.update({ where: { id: trainerId }, data });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_TRAINER",
      entityType: "trainer",
      entityId: trainerId,
      oldValue: before,
      newValue: after,
    });

    return after.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function deactivateTrainer(trainerId: string) {
  const record = await prisma.trainer.findUniqueOrThrow({
    where: { id: trainerId },
  });
  const session = await requireVendorAccess(record.vendorId, "vendor.update");

  const vendorId = await prisma.$transaction(async (tx) => {
    const before = await tx.trainer.findUniqueOrThrow({
      where: { id: trainerId },
    });
    const after = await tx.trainer.update({
      where: { id: trainerId },
      data: { status: "INACTIVE" },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "DEACTIVATE_TRAINER",
      entityType: "trainer",
      entityId: trainerId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });

    return after.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function setTrainerSpecializations(
  trainerId: string,
  specializationIds: string[],
) {
  const record = await prisma.trainer.findUniqueOrThrow({
    where: { id: trainerId },
  });
  const session = await requireVendorAccess(record.vendorId, "vendor.update");

  const vendorId = await prisma.$transaction(async (tx) => {
    const trainer = await tx.trainer.findUniqueOrThrow({
      where: { id: trainerId },
    });
    const before = await tx.trainerSpecializationMap.findMany({
      where: { trainerId },
    });

    await tx.trainerSpecializationMap.deleteMany({ where: { trainerId } });
    if (specializationIds.length > 0) {
      await tx.trainerSpecializationMap.createMany({
        data: specializationIds.map((specializationId) => ({
          trainerId,
          specializationId,
        })),
        skipDuplicates: true,
      });
    }

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_TRAINER_SPECIALIZATIONS",
      entityType: "trainer",
      entityId: trainerId,
      oldValue: { specializationIds: before.map((b) => b.specializationId) },
      newValue: { specializationIds },
    });

    return trainer.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function addTrainerPricing(
  trainerId: string,
  input: TrainerPricingInput,
) {
  const record = await prisma.trainer.findUniqueOrThrow({
    where: { id: trainerId },
  });
  const session = await requireVendorAccess(record.vendorId, "vendor.update");
  const data = trainerPricingSchema.parse(input);

  const vendorId = await prisma.$transaction(async (tx) => {
    const trainer = await tx.trainer.findUniqueOrThrow({
      where: { id: trainerId },
    });
    const created = await tx.trainerPricing.create({
      data: { ...data, trainerId },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_TRAINER_PRICING",
      entityType: "trainer_pricing",
      entityId: created.id,
      newValue: created,
    });

    return trainer.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function deleteTrainerPricing(pricingId: string) {
  const record = await prisma.trainerPricing.findUniqueOrThrow({
    where: { id: pricingId },
    include: { trainer: true },
  });
  const session = await requireVendorAccess(
    record.trainer.vendorId,
    "vendor.update",
  );

  const vendorId = await prisma.$transaction(async (tx) => {
    const pricing = await tx.trainerPricing.findUniqueOrThrow({
      where: { id: pricingId },
      include: { trainer: true },
    });
    await tx.trainerPricing.delete({ where: { id: pricingId } });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "DELETE_TRAINER_PRICING",
      entityType: "trainer_pricing",
      entityId: pricingId,
      oldValue: pricing,
    });

    return pricing.trainer.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function setTrainerAvailability(
  trainerId: string,
  slots: TrainerAvailabilitySlotInput[],
) {
  const record = await prisma.trainer.findUniqueOrThrow({
    where: { id: trainerId },
  });
  const session = await requireVendorAccess(record.vendorId, "vendor.update");
  const data = slots.map((slot) => trainerAvailabilitySlotSchema.parse(slot));

  const vendorId = await prisma.$transaction(async (tx) => {
    const trainer = await tx.trainer.findUniqueOrThrow({
      where: { id: trainerId },
    });
    const before = await tx.trainerAvailability.findMany({
      where: { trainerId },
    });

    await tx.trainerAvailability.deleteMany({ where: { trainerId } });
    if (data.length > 0) {
      await tx.trainerAvailability.createMany({
        data: data.map((slot) => ({
          trainerId,
          dayOfWeek: slot.dayOfWeek,
          startTime: toTime(slot.startTime),
          endTime: toTime(slot.endTime),
        })),
      });
    }

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_TRAINER_AVAILABILITY",
      entityType: "trainer_availability",
      entityId: trainerId,
      oldValue: before,
      newValue: data,
    });

    return trainer.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}
