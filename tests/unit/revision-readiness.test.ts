import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { getRevisionReadiness } from "@/lib/revision-readiness";
import { DAYS_OF_WEEK } from "@/lib/validations/vendor-schedule.schema";

const prime = {
  id: "prime",
  name: "Prime Time",
  price: 1400,
  description: null,
  durationUnit: "MONTHS",
  durationValue: 1,
  isFlexible: false,
  dailyStart: "09:00",
  dailyHours: 4,
};
const legacy = {
  ...prime,
  id: "legacy",
  name: "Existing legacy plan",
  durationValue: 12,
  dailyStart: null,
  dailyHours: null,
};
const fixture = () => ({
  partner: { status: "ACTIVE", approvalStatus: "APPROVED" },
  category: { status: "ACTIVE", launchEnabled: true },
  address: null,
  schedules: DAYS_OF_WEEK.map((dayOfWeek) => ({
    dayOfWeek,
    isClosed: false,
    openTime: new Date("1970-01-01T09:00:00Z"),
    closeTime: new Date("1970-01-01T18:00:00Z"),
  })),
  plans: [{ ...legacy }, { ...prime }],
});
const find = vi.fn();
const tx = {
  vendor: { findUniqueOrThrow: find },
} as unknown as Prisma.TransactionClient;
const planChanges = [{ kind: "PLAN_CREATE", targetId: "prime" }];

describe("revision validation scoped to proposed changes", () => {
  beforeEach(() => find.mockResolvedValue(fixture()));
  it("allows an existing listing's monthly plan without requiring Flex, quarterly and yearly products", async () => {
    expect(await getRevisionReadiness(tx, "listing", planChanges)).toEqual({
      ready: true,
      issues: [],
    });
  });
  it("does not reject an unrelated pre-existing legacy plan", async () => {
    const result = await getRevisionReadiness(tx, "listing", planChanges);
    expect(result.issues).toEqual([]);
  });
  it("checks the plan and schedule together using their final saved state", async () => {
    expect(
      (
        await getRevisionReadiness(tx, "listing", [
          ...planChanges,
          { kind: "SCHEDULE", targetId: "listing" },
        ])
      ).ready,
    ).toBe(true);
  });
  it("rejects a changed legacy plan that still violates the current plan schema", async () => {
    const result = await getRevisionReadiness(tx, "listing", [
      { kind: "PLAN_UPDATE", targetId: "legacy" },
    ]);
    expect(result.ready).toBe(false);
    expect(result.issues[0].message).toContain("Existing legacy plan:");
    expect(result.issues[0].message).not.toContain("Prime Time");
  });
  it("still blocks a new plan with an access window outside operating hours", async () => {
    const vendor = fixture();
    vendor.plans[1].dailyStart = "17:00";
    find.mockResolvedValue(vendor);
    expect(
      (await getRevisionReadiness(tx, "listing", planChanges)).issues,
    ).toContainEqual({
      section: "plans",
      message: "The daily window for Prime Time must fit every open day.",
    });
  });
  it("protects other valid active plans when a schedule change would break their access windows", async () => {
    const vendor = fixture();
    vendor.schedules[0].closeTime = new Date("1970-01-01T12:00:00Z");
    find.mockResolvedValue(vendor);
    const result = await getRevisionReadiness(tx, "listing", [
      { kind: "SCHEDULE", targetId: "listing" },
    ]);
    expect(result.issues).toEqual([
      {
        section: "plans",
        message: "The daily window for Prime Time must fit every open day.",
      },
    ]);
  });
  it("requires complete hours for a new bookable plan", async () => {
    const vendor = fixture();
    vendor.schedules.pop();
    find.mockResolvedValue(vendor);
    expect(
      (await getRevisionReadiness(tx, "listing", planChanges)).issues.map(
        (issue) => issue.section,
      ),
    ).toContain("schedule");
  });
  it("does not run first-publication setup checks for an unrelated photo change", async () => {
    const vendor = fixture();
    vendor.schedules = [];
    vendor.plans = [legacy];
    find.mockResolvedValue(vendor);
    expect(
      await getRevisionReadiness(tx, "listing", [
        { kind: "MEDIA_CREATE", targetId: "photo" },
      ]),
    ).toEqual({ ready: true, issues: [] });
  });
  it("retains partner and service eligibility checks", async () => {
    const vendor = fixture();
    vendor.partner.status = "INACTIVE";
    vendor.category.launchEnabled = false;
    find.mockResolvedValue(vendor);
    expect(
      (await getRevisionReadiness(tx, "listing", planChanges)).issues,
    ).toHaveLength(2);
  });
  it("does not impose a new fixed-window rule on unchanged Flex products during plan and schedule review", async () => {
    const vendor = fixture();
    vendor.plans.push({
      ...prime,
      id: "old-flex",
      durationUnit: "HOURS",
      isFlexible: true,
      dailyHours: 12,
    });
    find.mockResolvedValue(vendor);
    expect(
      (
        await getRevisionReadiness(tx, "listing", [
          ...planChanges,
          { kind: "SCHEDULE", targetId: "listing" },
        ])
      ).ready,
    ).toBe(true);
  });
  it("rejects a new Flex window that cannot fit any open day", async () => {
    const vendor = fixture();
    vendor.plans = [
      { ...prime, durationUnit: "HOURS", isFlexible: true, dailyHours: 12 },
    ];
    find.mockResolvedValue(vendor);
    expect(
      (await getRevisionReadiness(tx, "listing", planChanges)).issues,
    ).toEqual([
      {
        section: "plans",
        message:
          "The daily hours for Prime Time must fit at least one open day.",
      },
    ]);
  });
});
