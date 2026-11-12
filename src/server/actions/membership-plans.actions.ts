"use server";

import { isPublicActionError } from "@/lib/public-action-error";
import { Prisma } from "@/generated/prisma/client";
import {
  editorChanges,
  overlayRows,
  proposedParent,
} from "@/lib/listing-editor";
import { randomUUID } from "node:crypto";
import {
  ListingChangeConflict,
  queueListingChange,
} from "@/lib/listing-changes";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireVendorAccess } from "@/lib/rbac";
import {
  membershipPlanSchema,
  type MembershipPlanInput,
} from "@/lib/validations/membership-plan.schema";

// Review drafts may snapshot the full listing before saving. Allow database
// round trips and the audit write to finish together on the deployed runtime.
const PLAN_TRANSACTION_TIMEOUT_MS = 15_000;

export async function listMembershipPlans(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  const [plans, changes] = await Promise.all([
    prisma.membershipPlan.findMany({
      where: { vendorId },
      orderBy: { createdAt: "asc" },
    }),
    editorChanges(vendorId),
  ]);
  const planChanges = changes.filter((change) =>
    change.kind.startsWith("PLAN_"),
  );

  // Prisma's Decimal is a class instance, not a plain object -- Next.js
  // refuses to pass it from this Server Action to a Client Component
  // (PlanList/PlanFormDialog receive this array as props).
  return overlayRows(plans, changes, "PLAN", {
    vendorId,
    name: "",
    description: null,
    price: new Prisma.Decimal(0),
    currency: "INR",
    durationValue: 1,
    durationUnit: "MONTHS",
    dailyHours: null,
    dailyStart: null,
    isFlexible: false,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).map((plan) => {
    const pending = planChanges.filter((change) => change.targetId === plan.id);
    return {
      ...plan,
      price: Number(plan.price),
      pendingReview: pending.at(-1)?.status ?? null,
      proposedCreation: pending.some((change) => change.kind === "PLAN_CREATE"),
    };
  });
}

export type PlanRow = Awaited<ReturnType<typeof listMembershipPlans>>[number];

export type PlanSaveResult =
  { ok: true; outcome: "saved" | "queued" } | { ok: false; message: string };

function planSaveFailure(
  error: unknown,
  operation: "create" | "update",
  vendorId: string,
): PlanSaveResult {
  if (isPublicActionError(error) || error instanceof ListingChangeConflict)
    return { ok: false, message: error.message };

  const reference = randomUUID();
  console.error("Membership plan save failed", {
    reference,
    operation,
    vendorId,
    error,
  });
  return {
    ok: false,
    message: `Could not save this plan. Please try again. If it keeps failing, share this reference with support: ${reference}`,
  };
}

export async function createMembershipPlan(
  vendorId: string,
  input: MembershipPlanInput,
): Promise<PlanSaveResult> {
  let outcome: "saved" | "queued";
  try {
    const session = await requireVendorAccess(vendorId, "vendor.update");
    const parsed = membershipPlanSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, message: parsed.error.issues[0].message };
    const data = parsed.data;
    outcome = await prisma.$transaction(
      async (tx) => {
        if (
          await queueListingChange(
            tx,
            vendorId,
            session.user.id,
            "PLAN_CREATE",
            randomUUID(),
            data,
          )
        )
          return "queued" as const;
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
        return "saved" as const;
      },
      { timeout: PLAN_TRANSACTION_TIMEOUT_MS },
    );
  } catch (error) {
    return planSaveFailure(error, "create", vendorId);
  }

  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/plans");
  // Return only plain action data; Prisma records contain Decimal instances.
  return { ok: true, outcome };
}

export async function updateMembershipPlan(
  planId: string,
  input: MembershipPlanInput,
): Promise<PlanSaveResult> {
  let vendorId = "";
  let outcome: "saved" | "queued";
  try {
    const planRecord =
      (await prisma.membershipPlan.findUnique({ where: { id: planId } })) ??
      (await proposedParent(planId, "PLAN_CREATE"));
    vendorId = planRecord.vendorId;
    const session = await requireVendorAccess(vendorId, "vendor.update");
    const parsed = membershipPlanSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, message: parsed.error.issues[0].message };
    const data = parsed.data;
    outcome = await prisma.$transaction(
      async (tx) => {
        if (
          await queueListingChange(
            tx,
            vendorId,
            session.user.id,
            "PLAN_UPDATE",
            planId,
            data,
          )
        )
          return "queued" as const;
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
        return "saved" as const;
      },
      { timeout: PLAN_TRANSACTION_TIMEOUT_MS },
    );
  } catch (error) {
    return planSaveFailure(error, "update", vendorId);
  }

  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/plans");
  return { ok: true, outcome };
}

export async function archiveMembershipPlan(planId: string) {
  const planRecord =
    (await prisma.membershipPlan.findUnique({ where: { id: planId } })) ??
    (await proposedParent(planId, "PLAN_CREATE"));
  const session = await requireVendorAccess(
    planRecord.vendorId,
    "vendor.update",
  );

  const vendorId = await prisma.$transaction(
    async (tx) => {
      if (
        await queueListingChange(
          tx,
          planRecord.vendorId,
          session.user.id,
          "PLAN_ARCHIVE",
          planId,
          {},
        )
      )
        return planRecord.vendorId;
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
    },
    { timeout: PLAN_TRANSACTION_TIMEOUT_MS },
  );

  revalidatePath(`/vendors/${vendorId}`);
}
