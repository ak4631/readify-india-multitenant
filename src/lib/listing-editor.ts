import { prisma } from "@/lib/prisma";
import type { ListingChange } from "@/generated/prisma/client";

export async function editorChanges(vendorId: string) {
  return prisma.listingChange.findMany({
    where: {
      vendorId,
      status: { in: ["DRAFT", "PENDING"] },
      revision: { status: { in: ["DRAFT", "PENDING"] } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
export function changeData(
  c: Pick<ListingChange, "payload">,
): Record<string, unknown> {
  return c.payload && typeof c.payload === "object" && !Array.isArray(c.payload)
    ? (c.payload as Record<string, unknown>)
    : {};
}
export function overlayRows<T extends { id: string }>(
  rows: T[],
  changes: ListingChange[],
  prefix: string,
  defaults: Omit<T, "id">,
): T[] {
  const values = new Map(
    rows.map((row) => [
      row.id,
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          Array.isArray(value) ? [...value] : value,
        ]),
      ) as T,
    ]),
  );
  for (const c of changes) {
    if (c.kind === prefix + "_CREATE")
      values.set(c.targetId, {
        ...defaults,
        ...changeData(c),
        id: c.targetId,
      } as T);
    else if (c.kind === prefix + "_UPDATE" && values.has(c.targetId))
      values.set(c.targetId, { ...values.get(c.targetId)!, ...changeData(c) });
    else if (c.kind === prefix + "_DELETE") values.delete(c.targetId);
    else if (c.kind === prefix + "_ARCHIVE" && values.has(c.targetId))
      Object.assign(values.get(c.targetId)!, { status: "ARCHIVED" });
    else if (c.kind === prefix + "_DEACTIVATE" && values.has(c.targetId))
      Object.assign(values.get(c.targetId)!, { status: "INACTIVE" });
  }
  return [...values.values()];
}
// Resolve a newly proposed parent without writing it to customer-facing tables.
export async function proposedParent(id: string, kind: string) {
  const c = await prisma.listingChange.findFirst({
    where: {
      targetId: id,
      kind,
      status: "DRAFT",
      revision: { status: "DRAFT" },
    },
  });
  if (!c)
    throw new Error("This item no longer exists in the editable revision");
  return { id, vendorId: c.vendorId };
}
export async function proposalLabels(vendorId: string) {
  const [
    facilities,
    specializations,
    subjects,
    changes,
    trainers,
    teachers,
    courses,
    plans,
    categories,
    seats,
  ] = await Promise.all([
    prisma.facility.findMany({ select: { id: true, name: true } }),
    prisma.trainerSpecialization.findMany(),
    prisma.subject.findMany(),
    editorChanges(vendorId),
    prisma.trainer.findMany({
      where: { vendorId },
      select: { id: true, name: true },
    }),
    prisma.teacher.findMany({
      where: { vendorId },
      select: { id: true, name: true },
    }),
    prisma.course.findMany({
      where: { vendorId },
      select: { id: true, name: true },
    }),
    prisma.membershipPlan.findMany({
      where: { vendorId },
      select: { id: true, name: true },
    }),
    prisma.menuCategory.findMany({
      where: { vendorId },
      select: { id: true, name: true },
    }),
    prisma.librarySeatType.findMany({
      where: { vendorId },
      select: { id: true, name: true },
    }),
  ]);
  return Object.fromEntries(
    [
      ...facilities,
      ...specializations,
      ...subjects,
      ...trainers,
      ...teachers,
      ...courses,
      ...plans,
      ...categories,
      ...seats,
      ...changes.map((c) => ({
        id: c.targetId,
        name: String(
          changeData(c).name ??
            changeData(c).title ??
            c.kind.toLowerCase().replaceAll("_", " "),
        ),
      })),
    ].map((r) => [r.id, r.name]),
  );
}
