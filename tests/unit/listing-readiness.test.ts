import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { getReadiness, planFitsSchedule } from "@/lib/listing-readiness";
import { snapshotDigest } from "@/lib/listing-snapshot";
import { overlayRows } from "@/lib/listing-editor";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const userVendor = () => ({
  id: "v",
  categoryId: "category",
  partnerId: "partner",
  name: "Library",
  description: null,
  phone: "9999999999",
  email: null,
  website: null,
  category: { slug: "library", launchEnabled: true, status: "ACTIVE" },
  partner: { status: "ACTIVE", approvalStatus: "APPROVED" },
  address: {
    addressLine1: "Main Road",
    addressLine2: null,
    city: "Pune",
    state: "Maharashtra",
    pincode: "411001",
    latitude: 0,
    longitude: 0,
  },
  verifications: ["BUSINESS_REGISTRATION", "ADDRESS_PROOF", "OWNER_ID"].map(
    (documentType) => ({ documentType, status: "PENDING" }),
  ),
  schedules: [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ].map((dayOfWeek) => ({
    dayOfWeek,
    isClosed: false,
    openTime: new Date("1970-01-01T06:00:00Z"),
    closeTime: new Date("1970-01-01T22:00:00Z"),
  })),
  plans: [
    { isFlexible: true, durationUnit: "HOURS", durationValue: 1 },
    { isFlexible: false, durationUnit: "MONTHS", durationValue: 1 },
    { isFlexible: false, durationUnit: "MONTHS", durationValue: 3 },
    { isFlexible: false, durationUnit: "YEARS", durationValue: 1 },
  ].map((p) => ({
    ...p,
    name: "Plan",
    price: 100,
    dailyHours: 2,
    dailyStart: "10:00",
    description: null,
  })),
  seats: [{ id: "seat" }],
  capacity: null as number | null,
  trainers: [] as object[],
  teachers: [] as object[],
  courses: [] as object[],
});
const find = vi.fn();
const tx = {
  vendor: { findUniqueOrThrow: find },
} as unknown as Prisma.TransactionClient;
describe("listing readiness and immutable review evidence", () => {
  beforeEach(() => {
    find.mockResolvedValue(userVendor());
  });
  it("accepts valid zero coordinates and nullable optional database fields", async () => {
    expect((await getReadiness(tx, "v")).ready).toBe(true);
  });
  it("requires uploaded documents for submit and verified versions for approval", async () => {
    expect(
      (await getReadiness(tx, "v", true)).issues.filter(
        (i) => i.section === "verification",
      ),
    ).toHaveLength(3);
  });
  it("rejects an incomplete wizard regardless of its client step", async () => {
    const v = userVendor();
    v.seats = [];
    v.plans = [];
    find.mockResolvedValue(v);
    expect((await getReadiness(tx, "v")).issues.map((i) => i.section)).toEqual(
      expect.arrayContaining(["plans", "category"]),
    );
  });
  it("does not impose library seat and four-plan requirements on other categories", async () => {
    const v = userVendor();
    v.category.slug = "gym";
    v.seats = [];
    v.capacity = 20;
    v.trainers = [{}];
    v.verifications.push({
      documentType: "TRAINER_CERTIFICATION",
      status: "PENDING",
    });
    v.plans = v.plans.slice(1, 2);
    find.mockResolvedValue(v);
    expect((await getReadiness(tx, "v")).ready).toBe(true);
  });
  it("denies disabled services and inactive partners before publication", async () => {
    const v = userVendor();
    v.category.launchEnabled = false;
    v.partner.status = "INACTIVE";
    find.mockResolvedValue(v);
    expect((await getReadiness(tx, "v")).issues).toHaveLength(2);
  });
  it("checks every open day, rather than only today", () => {
    const days = userVendor().schedules;
    days[0].isClosed = true;
    expect(planFitsSchedule("10:00", 2, days)).toBe(true);
    days[1].closeTime = new Date("1970-01-01T11:00:00Z");
    expect(planFitsSchedule("10:00", 2, days)).toBe(false);
  });
  it("handles overnight, adjacent and full-day windows", () => {
    const day = {
      isClosed: false,
      openTime: new Date("1970-01-01T22:00:00Z"),
      closeTime: new Date("1970-01-01T06:00:00Z"),
    };
    expect(planFitsSchedule("01:00", 2, [day])).toBe(true);
    expect(planFitsSchedule("05:00", 2, [day])).toBe(false);
    expect(
      planFitsSchedule("22:00", 2, [
        {
          ...day,
          openTime: new Date("1970-01-01T00:00:00Z"),
          closeTime: new Date("1970-01-01T23:59:00Z"),
        },
      ]),
    ).toBe(true);
  });
  it("hashes canonical content rather than object insertion order, and detects changed values", () => {
    expect(snapshotDigest({ a: 1, b: 2 })).toBe(snapshotDigest({ b: 2, a: 1 }));
    expect(snapshotDigest({ a: 1 })).not.toBe(snapshotDigest({ a: 2 }));
  });
  it("overlays proposed creates/updates without changing approved row objects", () => {
    const baseline = [{ id: "p", name: "Approved", items: [] as string[] }];
    const changes = [
      { kind: "PLAN_UPDATE", targetId: "p", payload: { name: "Proposed" } },
    ] as never;
    const rows = overlayRows(baseline, changes, "PLAN", {
      name: "",
      items: [],
    });
    rows[0].items.push("test");
    expect(baseline).toEqual([{ id: "p", name: "Approved", items: [] }]);
    expect(rows[0].name).toBe("Proposed");
  });
});
