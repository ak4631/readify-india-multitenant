import type { Prisma } from "@/generated/prisma/client";
import { getRequiredDocuments } from "@/config/verification-requirements";
import { launchPlansReady } from "@/lib/launch-plans";
import {
  vendorAddressSchema,
  vendorBasicInfoSchema,
} from "@/lib/validations/vendor.schema";
import { membershipPlanSchema } from "@/lib/validations/membership-plan.schema";

export const SETUP_STEPS = [
  ["overview", "Basic details"],
  ["address", "Location"],
  ["verification", "Documents"],
  ["facilities", "Facilities"],
  ["schedule", "Operating hours"],
  ["category", "Service details"],
  ["plans", "Plans"],
  ["photos", "Photos"],
  ["review", "Review and submit"],
] as const;
export type ReadinessIssue = { section: string; message: string };
export async function getReadiness(
  tx: Prisma.TransactionClient,
  vendorId: string,
  verified = false,
) {
  const v = await tx.vendor.findUniqueOrThrow({
    where: { id: vendorId },
    include: {
      category: true,
      partner: true,
      address: true,
      verifications: true,
      schedules: true,
      plans: { where: { status: "ACTIVE" } },
      seats: { where: { isActive: true } },
      trainers: { where: { status: "ACTIVE" } },
      teachers: { where: { status: "ACTIVE" } },
      courses: { where: { status: "ACTIVE" } },
    },
  });
  const issues: ReadinessIssue[] = [];
  const add = (section: string, message: string) =>
    issues.push({ section, message });
  if (v.partner.status !== "ACTIVE" || v.partner.approvalStatus !== "APPROVED")
    add("overview", "The partner organization must be active and approved.");
  if (!v.category.launchEnabled || v.category.status !== "ACTIVE")
    add("overview", "This service is not enabled for publication.");
  if (
    !vendorBasicInfoSchema.safeParse({
      ...v,
      email: v.email ?? "",
      website: v.website ?? "",
      description: v.description ?? "",
    }).success
  )
    add("overview", "Complete valid basic listing details.");
  if (
    !v.address ||
    !vendorAddressSchema.safeParse({
      ...v.address,
      addressLine2: v.address.addressLine2 ?? undefined,
      latitude: v.address.latitude === null ? null : Number(v.address.latitude),
      longitude:
        v.address.longitude === null ? null : Number(v.address.longitude),
    }).success ||
    v.address.latitude === null ||
    v.address.longitude === null
  )
    add("address", "Save a valid address and map coordinates.");
  for (const type of getRequiredDocuments(v.category.slug)) {
    if (
      !v.verifications.some(
        (d) =>
          d.documentType === type &&
          (verified ? d.status === "VERIFIED" : d.status !== "REJECTED"),
      )
    )
      add(
        "verification",
        `${type.replaceAll("_", " ")} ${verified ? "must be verified" : "must be uploaded"}.`,
      );
  }
  if (v.schedules.length !== 7 || !v.schedules.some((d) => !d.isClosed))
    add("schedule", "Configure all seven days and at least one open day.");
  if (
    !v.plans.length ||
    v.plans.some(
      (p) =>
        !membershipPlanSchema.safeParse({
          ...p,
          description: p.description ?? undefined,
          price: Number(p.price),
        }).success,
    )
  )
    add("plans", "Add valid active plans with defined access windows.");
  if (v.category.slug === "library") {
    if (!v.seats.length)
      add("category", "Configure at least one active library seat.");
    if (!launchPlansReady(v.plans))
      add("plans", "Configure Flex, monthly, quarterly and yearly plans.");
  } else {
    if (!v.capacity || v.capacity < 1)
      add("category", "Set a positive service capacity.");
    if (v.category.slug === "gym" && !v.trainers.length)
      add("category", "Add at least one active trainer.");
    if (
      v.category.slug === "exam-hub" &&
      (!v.teachers.length || !v.courses.length)
    )
      add("category", "Add an active teacher and course.");
  }
  for (const plan of v.plans) {
    if (
      !plan.isFlexible &&
      plan.dailyStart &&
      plan.dailyHours &&
      !planFitsSchedule(plan.dailyStart, plan.dailyHours, v.schedules)
    )
      add(
        "plans",
        `The daily window for ${plan.name} must fit every open day.`,
      );
  }
  return { ready: issues.length === 0, issues };
}
export function assertReady(result: { issues: ReadinessIssue[] }) {
  if (result.issues.length)
    throw new Error(result.issues.map((i) => i.message).join(" "));
}

export function planFitsSchedule(
  start: string,
  hours: number,
  schedules: { isClosed: boolean; openTime: Date; closeTime: Date }[],
) {
  const minutes = (s: string) =>
    Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const open = schedules.filter((s) => !s.isClosed);
  return (
    open.length > 0 &&
    open.every((s) => {
      const from = minutes(s.openTime.toISOString().slice(11, 16));
      let until = minutes(s.closeTime.toISOString().slice(11, 16));
      if (until >= 1439) until = 1440;
      else if (until <= from) until += 1440;
      let at = minutes(start);
      if (until > 1440 && at < from) at += 1440;
      return at >= from && at + hours * 60 <= until;
    })
  );
}
