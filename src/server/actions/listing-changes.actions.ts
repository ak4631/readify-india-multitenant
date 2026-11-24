"use server";

import type {
  Prisma,
  Vendor,
  ListingRevision,
  ListingChange,
} from "@/generated/prisma/client";
import { PublicActionError } from "@/lib/public-action-error";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { lockListing } from "@/lib/listing-changes";
import { requireSuperAdminPermission, requireVendorAccess } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { membershipPlanSchema } from "@/lib/validations/membership-plan.schema";
import {
  vendorAddressSchema,
  vendorBasicInfoSchema,
} from "@/lib/validations/vendor.schema";
import { vendorScheduleSchema } from "@/lib/validations/vendor-schedule.schema";
import { vendorCapacitySchema } from "@/lib/validations/vendor-capacity.schema";
import { librarySeatTypeSchema } from "@/lib/validations/library-seat-type.schema";

import { randomUUID } from "node:crypto";
import { applyCategoryChange } from "@/lib/category-changes";
import { getRevisionReadiness } from "@/lib/revision-readiness";
import { listingSnapshot, snapshotDigest } from "@/lib/listing-snapshot";
import {
  assertReady,
  ListingReadinessError,
  type ReadinessIssue,
} from "@/lib/listing-readiness";

async function local_listListingChanges(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  return prisma.listingChange.findMany({
    where: { vendorId, status: { in: ["DRAFT", "PENDING"] } },
    orderBy: { createdAt: "asc" },
  });
}
async function local_listListingRevisions(vendorId: string) {
  await requireVendorAccess(vendorId, "vendor.read");
  const rows = await prisma.listingRevision.findMany({
    where: { vendorId },
    include: { changes: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(({ baseSnapshot, ...row }) => ({
    ...row,
    changes: row.changes.map((c) => ({
      ...c,
      approved: approvedValues(baseSnapshot, c.kind, c.targetId, c.payload),
    })),
    digest: snapshotDigest({
      baseVersion: row.baseVersion,
      changes: row.changes.map((c) => ({
        id: c.id,
        kind: c.kind,
        targetId: c.targetId,
        payload: c.payload,
      })),
    }),
  }));
}
async function local_submitListingRevision(revisionId: string) {
  const ref = await prisma.listingRevision.findUniqueOrThrow({
    where: { id: revisionId },
  });
  const session = await requireVendorAccess(ref.vendorId, "vendor.update");
  await prisma.$transaction(async (tx) => {
    const vendor = await lockListing(tx, ref.vendorId);
    const revision = await tx.listingRevision.findUniqueOrThrow({
      where: { id: revisionId },
      include: { changes: true },
    });
    if (revision.status !== "DRAFT" || !revision.changes.length)
      throw new PublicActionError(
        "Only a nonempty draft revision can be submitted",
      );
    if (revision.baseVersion !== vendor.contentVersion)
      throw new PublicActionError(
        "Approved content has changed. Withdraw this revision and prepare a new one.",
      );
    await tx.listingChange.updateMany({
      where: { revisionId },
      data: { status: "PENDING" },
    });
    await tx.listingRevision.update({
      where: { id: revisionId },
      data: { status: "PENDING", submittedAt: new Date() },
    });
    const reviewers = await tx.user.findMany({
      where: {
        status: "ACTIVE",
        roles: { some: { role: { name: "SUPER_ADMIN" } } },
      },
      select: { id: true },
    });
    if (reviewers.length)
      await tx.portalNotification.createMany({
        data: reviewers.map((u) => ({
          userId: u.id,
          title: "Listing changes awaiting approval",
          body: vendor.name,
          href: `/vendors/${vendor.id}?tab=changes`,
        })),
      });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "REQUEST_LISTING_CHANGE",
      entityType: "listing_change",
      entityId: revisionId,
      newValue: { status: "PENDING" },
    });
  });
  revalidatePath(`/vendors/${ref.vendorId}`);
  revalidatePath("/dashboard");
}
async function local_withdrawListingRevision(revisionId: string) {
  const ref = await prisma.listingRevision.findUniqueOrThrow({
    where: { id: revisionId },
  });
  const session = await requireVendorAccess(ref.vendorId, "vendor.update");
  await prisma.$transaction(async (tx) => {
    await lockListing(tx, ref.vendorId);
    const current = await tx.listingRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    if (!["DRAFT", "PENDING"].includes(current.status))
      throw new PublicActionError("This revision has already been decided");
    await tx.listingChange.updateMany({
      where: { revisionId },
      data: { status: "WITHDRAWN" },
    });
    await tx.listingRevision.update({
      where: { id: revisionId },
      data: { status: "WITHDRAWN" },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "REQUEST_LISTING_CHANGE",
      entityType: "listing_change",
      entityId: revisionId,
      newValue: { status: "WITHDRAWN" },
    });
  });
  revalidatePath(`/vendors/${ref.vendorId}`);
}
async function local_reviseListingRevision(revisionId: string) {
  const ref = await prisma.listingRevision.findUniqueOrThrow({
    where: { id: revisionId },
  });
  const session = await requireVendorAccess(ref.vendorId, "vendor.update");
  await prisma.$transaction(async (tx) => {
    const vendor = await lockListing(tx, ref.vendorId);
    const original = await tx.listingRevision.findUniqueOrThrow({
      where: { id: revisionId },
      include: { changes: true },
    });
    if (!["REJECTED", "WITHDRAWN"].includes(original.status))
      throw new PublicActionError(
        "Only rejected or withdrawn revisions can be copied for correction",
      );
    if (
      await tx.listingRevision.findFirst({
        where: { vendorId: ref.vendorId, status: { in: ["DRAFT", "PENDING"] } },
      })
    )
      throw new PublicActionError("Finish the current revision first");
    await copyRevisionForCorrection(tx, vendor, original, session.user.id);
  });
  revalidatePath(`/vendors/${ref.vendorId}`);
}
async function copyRevisionForCorrection(
  tx: Prisma.TransactionClient,
  vendor: Pick<Vendor, "id" | "contentVersion" | "partnerId">,
  original: ListingRevision & { changes: ListingChange[] },
  userId: string,
) {
  const copy = await tx.listingRevision.create({
    data: {
      vendorId: vendor.id,
      baseVersion: vendor.contentVersion,
      baseSnapshot: await listingSnapshot(tx, vendor.id),
      requestedBy: userId,
    },
  });
  const ids = new Map(
    original.changes
      .filter((c) => c.kind.endsWith("_CREATE"))
      .map((c) => [c.targetId, randomUUID()]),
  );
  const remap = (value: unknown): unknown =>
    typeof value === "string"
      ? (ids.get(value) ?? value)
      : Array.isArray(value)
        ? value.map(remap)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([k, v]) => [k, remap(v)]),
            )
          : value;
  await tx.listingChange.createMany({
    data: original.changes.map((c) => ({
      id: randomUUID(),
      vendorId: c.vendorId,
      revisionId: copy.id,
      kind: c.kind,
      targetId: ids.get(c.targetId) ?? c.targetId,
      payload: remap(c.payload) as object,
      status: "DRAFT",
      requestedBy: userId,
    })),
  });
  await writeAuditLog(tx, {
    userId,
    partnerId: vendor.partnerId,
    action: "REQUEST_LISTING_CHANGE",
    entityType: "listing_change",
    entityId: copy.id,
    newValue: { copiedFrom: original.id },
  });
}

async function local_reopenListingRevisionForCorrection(revisionId: string) {
  const ref = await prisma.listingRevision.findUniqueOrThrow({
    where: { id: revisionId },
  });
  const session = await requireVendorAccess(ref.vendorId, "vendor.update");
  await prisma.$transaction(
    async (tx) => {
      const vendor = await lockListing(tx, ref.vendorId);
      const original = await tx.listingRevision.findUniqueOrThrow({
        where: { id: revisionId },
        include: { changes: true },
      });
      if (original.status !== "PENDING")
        throw new PublicActionError(
          "Only a pending revision can be reopened. Reload to see its current state.",
        );
      if (!["PUBLISHED", "APPROVED", "SUSPENDED"].includes(vendor.status))
        throw new PublicActionError(
          "This listing cannot be revised in its current state.",
        );
      // Preserve the exact submitted payloads. Withdrawing the envelope releases
      // the unique active-revision slot before its editable copy is created.
      await tx.listingChange.updateMany({
        where: { revisionId },
        data: { status: "WITHDRAWN" },
      });
      await tx.listingRevision.update({
        where: { id: revisionId },
        data: { status: "WITHDRAWN" },
      });
      await writeAuditLog(tx, {
        userId: session.user.id,
        partnerId: vendor.partnerId,
        action: "REQUEST_LISTING_CHANGE",
        entityType: "listing_change",
        entityId: revisionId,
        oldValue: { status: "PENDING" },
        newValue: { status: "WITHDRAWN", correctionRequested: true },
      });
      await copyRevisionForCorrection(tx, vendor, original, session.user.id);
    },
    { timeout: 15_000 },
  );
  revalidatePath(`/vendors/${ref.vendorId}`);
  revalidatePath("/plans");
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
}

export type RevisionReviewResult =
  { ok: true } | { ok: false; message: string; issues: ReadinessIssue[] };

async function local_reviewListingRevision(
  revisionId: string,
  expectedDigest: string,
  approve: boolean,
  reason?: string,
): Promise<RevisionReviewResult> {
  const session = await requireSuperAdminPermission(
    approve ? "vendor.approve" : "vendor.reject",
  );
  const rejectionReason = approve
    ? null
    : z.string().trim().min(3).max(1000).parse(reason);
  const reference = await prisma.listingRevision.findUniqueOrThrow({
    where: { id: revisionId },
  });
  try {
    await prisma.$transaction(async (tx) => {
      const vendor = await lockListing(tx, reference.vendorId);
      const revision = await tx.listingRevision.findUniqueOrThrow({
        where: { id: revisionId },
        include: {
          changes: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        },
      });
      if (revision.status !== "PENDING")
        throw new PublicActionError("This revision is not awaiting review");
      const digest = snapshotDigest({
        baseVersion: revision.baseVersion,
        changes: revision.changes.map((c) => ({
          id: c.id,
          kind: c.kind,
          targetId: c.targetId,
          payload: c.payload,
        })),
      });
      if (!expectedDigest || digest !== expectedDigest)
        throw new PublicActionError(
          "The revision has changed. Reload before deciding.",
        );
      if (approve) {
        if (revision.baseVersion !== vendor.contentVersion)
          throw new PublicActionError(
            "This proposal is based on an older approved version. Reject it and request a corrected revision.",
          );
        if (!["PUBLISHED", "APPROVED", "SUSPENDED"].includes(vendor.status))
          throw new PublicActionError(
            "Review the listing's current status first",
          );
        // Parent creates precede dependent child operations, regardless of save order.
        const priority = (kind: string) =>
          kind.endsWith("CREATE")
            ? kind === "TRAINER_CREATE" ||
              kind === "TEACHER_CREATE" ||
              kind === "MENU_CATEGORY_CREATE"
              ? 0
              : kind === "COURSE_CREATE"
                ? 1
                : 2
            : kind === "MENU_CATEGORY_DELETE"
              ? 6
              : kind.endsWith("DELETE")
                ? 5
                : 3;
        for (const change of [...revision.changes].sort(
          (a, b) => priority(a.kind) - priority(b.kind),
        )) {
          const target = { id: change.targetId, vendorId: change.vendorId };
          switch (change.kind) {
            case "PROFILE": {
              const { partnerId: _partnerId, ...data } =
                vendorBasicInfoSchema.parse(change.payload);
              void _partnerId;
              if (data.categoryId !== vendor.categoryId)
                throw new PublicActionError(
                  "A listing service cannot be changed",
                );
              await tx.vendor.update({ where: { id: change.vendorId }, data });
              break;
            }
            case "ADDRESS": {
              const data = vendorAddressSchema.parse(change.payload);
              await tx.vendorAddress.upsert({
                where: { vendorId: change.vendorId },
                create: { ...data, vendorId: change.vendorId },
                update: data,
              });
              break;
            }
            case "CAPACITY":
              await tx.vendor.update({
                where: { id: change.vendorId },
                data: vendorCapacitySchema.parse(change.payload),
              });
              break;
            case "SCHEDULE":
              for (const day of vendorScheduleSchema.parse(change.payload)
                .days) {
                const data = {
                  isClosed: day.isClosed,
                  openTime: new Date(`1970-01-01T${day.openTime}:00Z`),
                  closeTime: new Date(`1970-01-01T${day.closeTime}:00Z`),
                };
                await tx.vendorSchedule.upsert({
                  where: {
                    vendorId_dayOfWeek: {
                      vendorId: change.vendorId,
                      dayOfWeek: day.dayOfWeek,
                    },
                  },
                  create: {
                    ...data,
                    vendorId: change.vendorId,
                    dayOfWeek: day.dayOfWeek,
                  },
                  update: data,
                });
              }
              {
                const check = await tx.$queryRaw<
                  { fits: boolean }[]
                >`SELECT admin.reservations_fit_schedule(${change.vendorId}) AS fits`;
                if (!check[0]?.fits)
                  throw new PublicActionError(
                    "These hours conflict with existing reservations. Cancel and refund affected purchases before changing the schedule.",
                  );
              }
              break;
            case "FACILITIES": {
              const ids = [
                ...new Set(
                  z.array(z.string().min(1)).max(200).parse(change.payload),
                ),
              ];
              if (
                (await tx.facility.count({
                  where: { id: { in: ids }, status: "ACTIVE" },
                })) !== ids.length
              )
                throw new PublicActionError(
                  "Some facilities are no longer active",
                );
              await tx.vendorFacility.deleteMany({
                where: { vendorId: change.vendorId },
              });
              if (ids.length)
                await tx.vendorFacility.createMany({
                  data: ids.map((facilityId) => ({
                    vendorId: change.vendorId,
                    facilityId,
                  })),
                  skipDuplicates: true,
                });
              break;
            }
            case "PLAN_CREATE":
              await tx.membershipPlan.create({
                data: {
                  ...membershipPlanSchema.parse(change.payload),
                  id: change.targetId,
                  vendorId: change.vendorId,
                },
              });
              break;
            case "PLAN_UPDATE":
              await tx.membershipPlan.update({
                where: target,
                data: membershipPlanSchema.parse(change.payload),
              });
              break;
            case "PLAN_ARCHIVE":
              await tx.membershipPlan.update({
                where: target,
                data: { status: "ARCHIVED" },
              });
              break;
            case "SEAT_CREATE":
              await tx.librarySeatType.create({
                data: {
                  ...librarySeatTypeSchema.parse(change.payload),
                  id: change.targetId,
                  vendorId: change.vendorId,
                },
              });
              break;
            case "SEAT_UPDATE":
              await tx.librarySeatType.update({
                where: target,
                data: librarySeatTypeSchema.parse(change.payload),
              });
              break;
            case "SEAT_DELETE":
              await tx.librarySeatType.delete({ where: target });
              break;
            case "MEDIA_CREATE": {
              const data = z
                .object({ mediaUrl: z.url(), externalId: z.string().min(1) })
                .parse(change.payload);
              const count = await tx.vendorMedia.count({
                where: { vendorId: change.vendorId },
              });
              await tx.vendorMedia.create({
                data: {
                  ...data,
                  ...target,
                  isPrimary: count === 0,
                  sortOrder: count,
                },
              });
              break;
            }
            case "MEDIA_DELETE":
              await tx.vendorMedia.delete({ where: target });
              break;
            case "MEDIA_PRIMARY":
              await tx.vendorMedia.findUniqueOrThrow({ where: target });
              await tx.vendorMedia.updateMany({
                where: { vendorId: change.vendorId },
                data: { isPrimary: false },
              });
              await tx.vendorMedia.update({
                where: target,
                data: { isPrimary: true },
              });
              break;
            case "SEAT_ACTIVE": {
              const data = z
                .object({ isActive: z.boolean() })
                .parse(change.payload);
              if (!data.isActive) {
                const occupied = await tx.$queryRaw<
                  { busy: boolean }[]
                >`SELECT EXISTS(SELECT 1 FROM admin.seat_busy_intervals(${change.targetId}, now(), now() + interval '100 years')) AS busy`;
                if (occupied[0]?.busy)
                  throw new PublicActionError(
                    "This seat has reservations. Cancel them before deactivating it.",
                  );
              }
              await tx.librarySeat.update({ where: target, data });
              break;
            }
            default:
              if (!(await applyCategoryChange(tx, change)))
                throw new PublicActionError(
                  "Unsupported change type. No changes were applied.",
                );
          }
        }
        assertReady(
          await getRevisionReadiness(tx, vendor.id, revision.changes),
        );
        await tx.vendor.update({
          where: { id: vendor.id },
          data: { contentVersion: { increment: 1 } },
        });
      }
      await tx.listingChange.updateMany({
        where: { revisionId },
        data: {
          status: approve ? "APPROVED" : "REJECTED",
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          reason: rejectionReason,
        },
      });
      await tx.listingRevision.update({
        where: { id: revisionId },
        data: {
          status: approve ? "APPROVED" : "REJECTED",
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          reason: rejectionReason,
        },
      });
      await tx.portalNotification.create({
        data: {
          userId: revision.requestedBy,
          title: approve
            ? "Listing changes approved"
            : "Listing changes rejected",
          body: vendor.name + (rejectionReason ? `: ${rejectionReason}` : ""),
          href: `/vendors/${vendor.id}?tab=changes`,
        },
      });
      await writeAuditLog(tx, {
        userId: session.user.id,
        action: approve ? "APPROVE_LISTING_CHANGE" : "REJECT_LISTING_CHANGE",
        entityType: "listing_change",
        entityId: revisionId,
        newValue: {
          digest,
          status: approve ? "APPROVED" : "REJECTED",
          reason: rejectionReason,
        },
      });
    });
  } catch (error) {
    // Catch after the transaction rejects so partially applied proposals roll back.
    if (error instanceof ListingReadinessError)
      return {
        ok: false,
        message:
          "Approval blocked. Resolve these issues with the proposed changes before approving the revision.",
        issues: error.issues,
      };
    throw error;
  }
  revalidatePath(`/vendors/${reference.vendorId}`);
  revalidatePath("/vendors");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  return { ok: true };
}

function approvedValues(
  snapshot: unknown,
  kind: string,
  targetId: string,
  payload: unknown,
): unknown {
  if (!snapshot || typeof snapshot !== "object")
    return "Legacy approved snapshot unavailable";
  if (kind.endsWith("_CREATE")) return null;
  const root = snapshot as Record<string, unknown>;
  if (kind === "FACILITIES")
    return Array.isArray(root.facilities)
      ? root.facilities.map((f) => (f as { facilityId: string }).facilityId)
      : [];
  if (kind === "CAPACITY") return { capacity: root.capacity };
  if (kind === "PROFILE")
    return Object.fromEntries(
      ["name", "description", "phone", "email", "website"].map((k) => [
        k,
        root[k],
      ]),
    );
  if (kind === "ADDRESS") return root.address;
  if (kind === "SCHEDULE") return root.schedules;
  function find(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object") return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const r = find(item);
        if (r) return r;
      }
      return null;
    }
    const record = value as Record<string, unknown>;
    if (record.id === targetId) return record;
    for (const v of Object.values(record)) {
      const r = find(v);
      if (r) return r;
    }
    return null;
  }
  const old = find(root);
  if (!old) return null;
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.keys(payload).length
  )
    return Object.fromEntries(
      Object.keys(payload)
        .filter((k) => k !== "documentUrl")
        .map((k) => [k, old[k] ?? null]),
    );
  return Object.fromEntries(
    Object.entries(old).filter(
      ([k, v]) =>
        !["documentUrl", "meetingUrl", "recordingUrl"].includes(k) &&
        typeof v !== "object",
    ),
  );
}

async function local_discardDraftChange(changeId: string) {
  const ref = await prisma.listingChange.findUniqueOrThrow({
    where: { id: changeId },
  });
  const session = await requireVendorAccess(ref.vendorId, "vendor.update");
  await prisma.$transaction(async (tx) => {
    await lockListing(tx, ref.vendorId);
    const current = await tx.listingChange.findUniqueOrThrow({
      where: { id: changeId },
      include: { revision: true },
    });
    if (current.status !== "DRAFT" || current.revision?.status !== "DRAFT")
      throw new PublicActionError(
        "Only an editable draft change can be removed",
      );
    const all = await tx.listingChange.findMany({
      where: { revisionId: current.revisionId },
    });
    const removed = new Set([changeId]);
    const targets = new Set<string>();
    if (current.kind.endsWith("_CREATE")) targets.add(current.targetId);
    const references = (value: unknown): boolean =>
      typeof value === "string"
        ? targets.has(value)
        : Array.isArray(value)
          ? value.some(references)
          : !!value && typeof value === "object"
            ? Object.values(value).some(references)
            : false;
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of all)
        if (
          !removed.has(c.id) &&
          (targets.has(c.targetId) || references(c.payload))
        ) {
          removed.add(c.id);
          if (c.kind.endsWith("_CREATE")) targets.add(c.targetId);
          changed = true;
        }
    }
    await tx.listingChange.deleteMany({ where: { id: { in: [...removed] } } });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "REQUEST_LISTING_CHANGE",
      entityType: "listing_change",
      entityId: current.revisionId!,
      newValue: { removedChanges: [...removed], vendorId: ref.vendorId },
    });
  });
  revalidatePath(`/vendors/${ref.vendorId}`);
}

export async function listListingChanges(
  ...args: Parameters<typeof local_listListingChanges>
): Promise<Awaited<ReturnType<typeof local_listListingChanges>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listListingChanges>>>(
      "listing-changes.actions.listListingChanges",
      args,
    );
  }
  return local_listListingChanges(...args);
}

export async function listListingRevisions(
  ...args: Parameters<typeof local_listListingRevisions>
): Promise<Awaited<ReturnType<typeof local_listListingRevisions>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listListingRevisions>>>(
      "listing-changes.actions.listListingRevisions",
      args,
    );
  }
  return local_listListingRevisions(...args);
}

export async function submitListingRevision(
  ...args: Parameters<typeof local_submitListingRevision>
): Promise<Awaited<ReturnType<typeof local_submitListingRevision>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_submitListingRevision>>>(
      "listing-changes.actions.submitListingRevision",
      args,
    );
  }
  return local_submitListingRevision(...args);
}

export async function withdrawListingRevision(
  ...args: Parameters<typeof local_withdrawListingRevision>
): Promise<Awaited<ReturnType<typeof local_withdrawListingRevision>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_withdrawListingRevision>>
    >("listing-changes.actions.withdrawListingRevision", args);
  }
  return local_withdrawListingRevision(...args);
}

export async function reviseListingRevision(
  ...args: Parameters<typeof local_reviseListingRevision>
): Promise<Awaited<ReturnType<typeof local_reviseListingRevision>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_reviseListingRevision>>>(
      "listing-changes.actions.reviseListingRevision",
      args,
    );
  }
  return local_reviseListingRevision(...args);
}

export async function reopenListingRevisionForCorrection(
  ...args: Parameters<typeof local_reopenListingRevisionForCorrection>
): Promise<
  Awaited<ReturnType<typeof local_reopenListingRevisionForCorrection>>
> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_reopenListingRevisionForCorrection>>
    >("listing-changes.actions.reopenListingRevisionForCorrection", args);
  }
  return local_reopenListingRevisionForCorrection(...args);
}

export async function reviewListingRevision(
  ...args: Parameters<typeof local_reviewListingRevision>
): Promise<Awaited<ReturnType<typeof local_reviewListingRevision>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_reviewListingRevision>>>(
      "listing-changes.actions.reviewListingRevision",
      args,
    );
  }
  return local_reviewListingRevision(...args);
}

export async function discardDraftChange(
  ...args: Parameters<typeof local_discardDraftChange>
): Promise<Awaited<ReturnType<typeof local_discardDraftChange>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_discardDraftChange>>>(
      "listing-changes.actions.discardDraftChange",
      args,
    );
  }
  return local_discardDraftChange(...args);
}
