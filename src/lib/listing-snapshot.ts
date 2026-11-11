import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if ("toJSON" in value && typeof value.toJSON === "function")
    return canonicalJson(value.toJSON());
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  return (
    "{" +
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonicalJson(v))
      .join(",") +
    "}"
  );
}
export const snapshotDigest = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
export async function listingSnapshot(
  tx: Prisma.TransactionClient,
  vendorId: string,
) {
  const v = await tx.vendor.findUniqueOrThrow({
    where: { id: vendorId },
    select: {
      id: true,
      name: true,
      description: true,
      phone: true,
      email: true,
      website: true,
      categoryId: true,
      partnerId: true,
      capacity: true,
      timeZone: true,
      address: true,
      facilities: { orderBy: { facilityId: "asc" } },
      plans: { orderBy: { id: "asc" } },
      schedules: { orderBy: { dayOfWeek: "asc" } },
      media: { orderBy: { id: "asc" } },
      seatTypes: { orderBy: { id: "asc" } },
      seats: {
        orderBy: { id: "asc" },
        select: { id: true, label: true, seatTypeId: true, isActive: true },
      },
      trainers: {
        orderBy: { id: "asc" },
        include: {
          pricing: { orderBy: { id: "asc" } },
          availability: { orderBy: { id: "asc" } },
          specializations: { orderBy: { specializationId: "asc" } },
        },
      },
      teachers: { orderBy: { id: "asc" } },
      courses: {
        orderBy: { id: "asc" },
        include: {
          teachers: { orderBy: { teacherId: "asc" } },
          lectures: { orderBy: { id: "asc" } },
        },
      },
      menuCategories: {
        orderBy: { id: "asc" },
        include: { items: { orderBy: { id: "asc" } } },
      },
      verifications: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          documentType: true,
          documentNumber: true,
          documentUrl: true,
        },
      },
    },
  });
  return JSON.parse(canonicalJson(v)) as Prisma.InputJsonObject;
}
