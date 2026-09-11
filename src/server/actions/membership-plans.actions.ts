"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireVendorAccess } from "@/lib/rbac";
import {
  membershipPlanSchema,
  type MembershipPlanInput,
} from "@/lib/validations/membership-plan.schema";

export async function listMembershipPlans(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  return prisma.membershipPlan.findMany({
    where: { vendorId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createMembershipPlan(
  vendorId: string,
  input: MembershipPlanInput,
) {
  const session = await requireVendorAccess(vendorId, "vendor.update");
  const data = membershipPlanSchema.parse(input);

  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.membershipPlan.create({
      data: { ...data, vendorId },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CREATE_MEMBERSHIP_PLAN",
      entityType: "membership_plan",
      entityId: created.id,
      newValue: created,
    });

    return created;
  });

  revalidatePath(`/vendors/${vendorId}`);
  return plan;
}

export async function updateMembershipPlan(
  planId: string,
  input: MembershipPlanInput,
) {
  const planRecord = await prisma.membershipPlan.findUniqueOrThrow({
    where: { id: planId },
  });
  const session = await requireVendorAccess(
    planRecord.vendorId,
    "vendor.update",
  );
  const data = membershipPlanSchema.parse(input);

  const vendorId = await prisma.$transaction(async (tx) => {
    const before = await tx.membershipPlan.findUniqueOrThrow({
      where: { id: planId },
    });
    const after = await tx.membershipPlan.update({
      where: { id: planId },
      data,
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_MEMBERSHIP_PLAN",
      entityType: "membership_plan",
      entityId: planId,
      oldValue: before,
      newValue: after,
    });

    return after.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function archiveMembershipPlan(planId: string) {
  const planRecord = await prisma.membershipPlan.findUniqueOrThrow({
    where: { id: planId },
  });
  const session = await requireVendorAccess(
    planRecord.vendorId,
    "vendor.update",
  );

  const vendorId = await prisma.$transaction(async (tx) => {
    const before = await tx.membershipPlan.findUniqueOrThrow({
      where: { id: planId },
    });
    const after = await tx.membershipPlan.update({
      where: { id: planId },
      data: { status: "ARCHIVED" },
    });

    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "ARCHIVE_MEMBERSHIP_PLAN",
      entityType: "membership_plan",
      entityId: planId,
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });

    return after.vendorId;
  });

  revalidatePath(`/vendors/${vendorId}`);
}
