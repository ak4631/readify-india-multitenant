"use server";

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
  trainerAvailabilitySchema,
  trainerPricingSchema,
  trainerSchema,
  type TrainerAvailabilitySlotInput,
  type TrainerInput,
  type TrainerPricingInput,
} from "@/lib/validations/trainer.schema";

function toTime(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

async function local_listTrainers(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  const trainers = await prisma.trainer.findMany({
    where: { vendorId },
    orderBy: { createdAt: "asc" },
    include: {
      specializations: { include: { specialization: true } },
      pricing: true,
      availability: true,
    },
  });

  // Decimal (TrainerPricing.price) is a class instance, not a plain object --
  // Next.js refuses to pass it from this Server Action to a Client Component
  // (TrainersList/TrainerDetailDialog receive this array as props).
  const changes = await editorChanges(vendorId);
  const allSpecs = await prisma.trainerSpecialization.findMany();
  const proposed = overlayRows(trainers, changes, "TRAINER", {
    vendorId,
    name: "",
    bio: null,
    experienceYears: null,
    profilePhotoUrl: null,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    pricing: [],
    availability: [],
    specializations: [],
  });
  for (const trainer of proposed) {
    for (const c of changes) {
      const d = changeData(c);
      if (c.kind === "TRAINER_PRICE_CREATE" && d.trainerId === trainer.id)
        trainer.pricing.push({
          ...d,
          id: c.targetId,
          createdAt: new Date(),
        } as (typeof trainer.pricing)[number]);
      if (c.kind === "TRAINER_PRICE_DELETE")
        trainer.pricing = trainer.pricing.filter((p) => p.id !== c.targetId);
      if (c.targetId !== trainer.id) continue;
      if (c.kind === "TRAINER_SPECIALIZATIONS" && Array.isArray(c.payload))
        trainer.specializations = c.payload
          .map((id) => ({
            trainerId: trainer.id,
            specializationId: String(id),
            specialization: allSpecs.find((s) => s.id === id)!,
          }))
          .filter((s) => !!s.specialization);
      if (c.kind === "TRAINER_AVAILABILITY" && Array.isArray(c.payload))
        trainer.availability = c.payload.map((v, i) => {
          const d = v as Record<string, string>;
          return {
            id: c.id + String(i),
            trainerId: trainer.id,
            dayOfWeek: d.dayOfWeek,
            startTime: new Date("1970-01-01T" + d.startTime + ":00Z"),
            endTime: new Date("1970-01-01T" + d.endTime + ":00Z"),
          };
        }) as typeof trainer.availability;
    }
  }
  return proposed.map((trainer) => ({
    ...trainer,
    pricing: trainer.pricing.map((p) => ({ ...p, price: Number(p.price) })),
  }));
}

export type TrainerRow = Awaited<ReturnType<typeof listTrainers>>[number];

async function local_listTrainerSpecializations() {
  await requirePermission("vendor.read");
  return prisma.trainerSpecialization.findMany({ orderBy: { name: "asc" } });
}

async function local_createTrainer(vendorId: string, input: TrainerInput) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = trainerSchema.parse(input);

  const trainer = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        vendorId,
        session.user.id,
        "TRAINER_CREATE",
        randomUUID(),
        data,
      )
    )
      return;
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

async function local_updateTrainer(trainerId: string, input: TrainerInput) {
  const record =
    (await prisma.trainer.findUnique({ where: { id: trainerId } })) ??
    (await proposedParent(trainerId, "TRAINER_CREATE"));
  const session = await requireVendorAccess(record.vendorId, "vendor.update");
  const data = trainerSchema.parse(input);

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        record.vendorId,
        session.user.id,
        "TRAINER_UPDATE",
        trainerId,
        data,
      )
    )
      return record.vendorId;
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

async function local_deactivateTrainer(trainerId: string) {
  const record =
    (await prisma.trainer.findUnique({ where: { id: trainerId } })) ??
    (await proposedParent(trainerId, "TRAINER_CREATE"));
  const session = await requireVendorAccess(record.vendorId, "vendor.update");

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        record.vendorId,
        session.user.id,
        "TRAINER_DEACTIVATE",
        trainerId,
        {},
      )
    )
      return record.vendorId;
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

async function local_setTrainerSpecializations(
  trainerId: string,
  specializationIds: string[],
) {
  const record =
    (await prisma.trainer.findUnique({ where: { id: trainerId } })) ??
    (await proposedParent(trainerId, "TRAINER_CREATE"));
  const session = await requireVendorAccess(record.vendorId, "vendor.update");

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        record.vendorId,
        session.user.id,
        "TRAINER_SPECIALIZATIONS",
        trainerId,
        specializationIds,
      )
    )
      return record.vendorId;
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

async function local_addTrainerPricing(
  trainerId: string,
  input: TrainerPricingInput,
) {
  const record =
    (await prisma.trainer.findUnique({ where: { id: trainerId } })) ??
    (await proposedParent(trainerId, "TRAINER_CREATE"));
  const session = await requireVendorAccess(record.vendorId, "vendor.update");
  const data = trainerPricingSchema.parse(input);

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        record.vendorId,
        session.user.id,
        "TRAINER_PRICE_CREATE",
        randomUUID(),
        { ...data, trainerId },
      )
    )
      return record.vendorId;
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

async function local_deleteTrainerPricing(pricingId: string) {
  const priceRecord = await prisma.trainerPricing.findUnique({
    where: { id: pricingId },
    include: { trainer: true },
  });
  const staged = priceRecord
    ? null
    : await prisma.listingChange.findFirstOrThrow({
        where: {
          targetId: pricingId,
          kind: "TRAINER_PRICE_CREATE",
          status: "DRAFT",
        },
      });
  const record = priceRecord ?? { trainer: { vendorId: staged!.vendorId } };
  const session = await requireVendorAccess(
    record.trainer.vendorId,
    "vendor.update",
  );

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        record.trainer.vendorId,
        session.user.id,
        "TRAINER_PRICE_DELETE",
        pricingId,
        {},
      )
    )
      return record.trainer.vendorId;
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

async function local_setTrainerAvailability(
  trainerId: string,
  slots: TrainerAvailabilitySlotInput[],
) {
  const record =
    (await prisma.trainer.findUnique({ where: { id: trainerId } })) ??
    (await proposedParent(trainerId, "TRAINER_CREATE"));
  const session = await requireVendorAccess(record.vendorId, "vendor.update");
  const data = trainerAvailabilitySchema.parse(slots);

  const vendorId = await prisma.$transaction(async (tx) => {
    if (
      await queueListingChange(
        tx,
        record.vendorId,
        session.user.id,
        "TRAINER_AVAILABILITY",
        trainerId,
        data,
      )
    )
      return record.vendorId;
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

export async function listTrainers(
  ...args: Parameters<typeof local_listTrainers>
): Promise<Awaited<ReturnType<typeof local_listTrainers>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listTrainers>>>(
      "trainers.actions.listTrainers",
      args,
    );
  }
  return local_listTrainers(...args);
}

export async function listTrainerSpecializations(
  ...args: Parameters<typeof local_listTrainerSpecializations>
): Promise<Awaited<ReturnType<typeof local_listTrainerSpecializations>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_listTrainerSpecializations>>
    >("trainers.actions.listTrainerSpecializations", args);
  }
  return local_listTrainerSpecializations(...args);
}

export async function createTrainer(
  ...args: Parameters<typeof local_createTrainer>
): Promise<Awaited<ReturnType<typeof local_createTrainer>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_createTrainer>>>(
      "trainers.actions.createTrainer",
      args,
    );
  }
  return local_createTrainer(...args);
}

export async function updateTrainer(
  ...args: Parameters<typeof local_updateTrainer>
): Promise<Awaited<ReturnType<typeof local_updateTrainer>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_updateTrainer>>>(
      "trainers.actions.updateTrainer",
      args,
    );
  }
  return local_updateTrainer(...args);
}

export async function deactivateTrainer(
  ...args: Parameters<typeof local_deactivateTrainer>
): Promise<Awaited<ReturnType<typeof local_deactivateTrainer>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_deactivateTrainer>>>(
      "trainers.actions.deactivateTrainer",
      args,
    );
  }
  return local_deactivateTrainer(...args);
}

export async function setTrainerSpecializations(
  ...args: Parameters<typeof local_setTrainerSpecializations>
): Promise<Awaited<ReturnType<typeof local_setTrainerSpecializations>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_setTrainerSpecializations>>
    >("trainers.actions.setTrainerSpecializations", args);
  }
  return local_setTrainerSpecializations(...args);
}

export async function addTrainerPricing(
  ...args: Parameters<typeof local_addTrainerPricing>
): Promise<Awaited<ReturnType<typeof local_addTrainerPricing>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_addTrainerPricing>>>(
      "trainers.actions.addTrainerPricing",
      args,
    );
  }
  return local_addTrainerPricing(...args);
}

export async function deleteTrainerPricing(
  ...args: Parameters<typeof local_deleteTrainerPricing>
): Promise<Awaited<ReturnType<typeof local_deleteTrainerPricing>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_deleteTrainerPricing>>>(
      "trainers.actions.deleteTrainerPricing",
      args,
    );
  }
  return local_deleteTrainerPricing(...args);
}

export async function setTrainerAvailability(
  ...args: Parameters<typeof local_setTrainerAvailability>
): Promise<Awaited<ReturnType<typeof local_setTrainerAvailability>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_setTrainerAvailability>>
    >("trainers.actions.setTrainerAvailability", args);
  }
  return local_setTrainerAvailability(...args);
}
