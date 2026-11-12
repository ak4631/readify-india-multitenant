import type { ListingChange, Prisma } from "@/generated/prisma/client";
import type { ReadinessIssue } from "@/lib/listing-readiness";
import { planFitsSchedule } from "@/lib/listing-readiness";
import { membershipPlanSchema } from "@/lib/validations/membership-plan.schema";
import { vendorAddressSchema } from "@/lib/validations/vendor.schema";
import { DAYS_OF_WEEK } from "@/lib/validations/vendor-schedule.schema";

// Revision approval validates the result of these changes. Initial publication
// still uses getReadiness and its complete onboarding/product requirements.
export async function getRevisionReadiness(
  tx: Prisma.TransactionClient,
  vendorId: string,
  changes: Pick<ListingChange, "kind" | "targetId">[],
) {
  const vendor = await tx.vendor.findUniqueOrThrow({
    where: { id: vendorId },
    select: {
      partner: { select: { status: true, approvalStatus: true } },
      category: { select: { launchEnabled: true, status: true } },
      address: true,
      schedules: true,
      plans: { where: { status: "ACTIVE" } },
    },
  });
  const issues: ReadinessIssue[] = [];
  const add = (section: string, message: string) =>
    issues.push({ section, message });
  if (
    vendor.partner.status !== "ACTIVE" ||
    vendor.partner.approvalStatus !== "APPROVED"
  )
    add("overview", "The partner organization must be active and approved.");
  if (!vendor.category.launchEnabled || vendor.category.status !== "ACTIVE")
    add("overview", "This service is not enabled for publication.");

  if (changes.some((change) => change.kind === "ADDRESS")) {
    const address = vendor.address;
    if (
      !address ||
      address.latitude === null ||
      address.longitude === null ||
      !vendorAddressSchema.safeParse({
        ...address,
        addressLine2: address.addressLine2 ?? undefined,
        latitude: Number(address.latitude),
        longitude: Number(address.longitude),
      }).success
    )
      add("address", "Save a valid address and map coordinates.");
  }

  const changedPlans = new Set(
    changes
      .filter(
        (change) =>
          change.kind === "PLAN_CREATE" || change.kind === "PLAN_UPDATE",
      )
      .map((change) => change.targetId),
  );
  const scheduleChanged = changes.some((change) => change.kind === "SCHEDULE");
  if (scheduleChanged || changedPlans.size > 0) {
    const days = new Set(vendor.schedules.map((day) => day.dayOfWeek));
    if (
      !DAYS_OF_WEEK.every((day) => days.has(day)) ||
      !vendor.schedules.some((day) => !day.isClosed)
    )
      add("schedule", "Configure all seven days and at least one open day.");
  }
  for (const plan of vendor.plans) {
    const changed = changedPlans.has(plan.id);
    if (!changed && !scheduleChanged) continue;
    const parsed = membershipPlanSchema.safeParse({
      ...plan,
      description: plan.description ?? undefined,
      price: Number(plan.price),
    });
    if (!parsed.success) {
      // Existing legacy rows are not part of a new plan's approval. Any edits
      // to those rows must meet the current plan rules before being approved.
      if (changed)
        add("plans", `${plan.name}: ${parsed.error.issues[0].message}`);
      continue;
    }
    if (
      !plan.isFlexible &&
      plan.dailyStart &&
      plan.dailyHours &&
      !planFitsSchedule(plan.dailyStart, plan.dailyHours, vendor.schedules)
    )
      add(
        "plans",
        `The daily window for ${plan.name} must fit every open day.`,
      );
    if (
      changed &&
      plan.isFlexible &&
      plan.dailyHours &&
      !vendor.schedules.some(
        (day) =>
          !day.isClosed &&
          planFitsSchedule(
            day.openTime.toISOString().slice(11, 16),
            plan.dailyHours!,
            [day],
          ),
      )
    )
      add(
        "plans",
        `The daily hours for ${plan.name} must fit at least one open day.`,
      );
  }
  return { ready: issues.length === 0, issues };
}
