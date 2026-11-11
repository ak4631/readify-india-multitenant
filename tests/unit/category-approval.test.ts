import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  queue: vi.fn(),
  mutate: vi.fn(),
  transaction: vi.fn(),
  find: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rbac", () => ({
  requireVendorAccess: m.access,
  requirePermission: m.access,
}));
vi.mock("@/lib/listing-changes", () => ({ queueListingChange: m.queue }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: m.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: m.transaction,
    trainer: { findUnique: m.find },
    teacher: { findUnique: m.find },
    course: { findUnique: m.find, findFirst: m.find },
    menuCategory: { findUnique: m.find, findFirst: m.find },
    menuItem: { findFirst: m.find },
    trainerPricing: { findUnique: m.find },
    lecture: { findFirst: m.find },
  },
}));
import {
  createTrainer,
  updateTrainer,
  deactivateTrainer,
  addTrainerPricing,
  deleteTrainerPricing,
  setTrainerAvailability,
  setTrainerSpecializations,
} from "@/server/actions/trainers.actions";
import {
  createTeacher,
  updateTeacher,
  deactivateTeacher,
} from "@/server/actions/teachers.actions";
import {
  createCourse,
  updateCourse,
  archiveCourse,
  createLecture,
  cancelLecture,
} from "@/server/actions/courses.actions";
import {
  createMenuCategory,
  deleteMenuCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "@/server/actions/menu.actions";
const person = { name: "Valid person" };
const course = { name: "Course", price: 100, mode: "OFFLINE" as const };
const item = { name: "Coffee", price: 20, isAvailable: true };
const cases: [string, () => Promise<unknown>][] = [
  ["trainer create", () => createTrainer("v", person)],
  ["trainer update", () => updateTrainer("t", person)],
  ["trainer deactivate", () => deactivateTrainer("t")],
  [
    "trainer pricing",
    () =>
      addTrainerPricing("t", {
        price: 100,
        durationValue: 1,
        durationUnit: "MONTHS",
      }),
  ],
  ["trainer price delete", () => deleteTrainerPricing("p")],
  [
    "trainer availability",
    () =>
      setTrainerAvailability("t", [
        { dayOfWeek: "MONDAY", startTime: "09:00", endTime: "10:00" },
      ]),
  ],
  ["trainer specializations", () => setTrainerSpecializations("t", [])],
  ["teacher create", () => createTeacher("v", person)],
  ["teacher update", () => updateTeacher("t", person)],
  ["teacher deactivate", () => deactivateTeacher("t")],
  ["course create", () => createCourse("v", course)],
  ["course update", () => updateCourse("c", course)],
  ["course archive", () => archiveCourse("c")],
  [
    "lecture create",
    () =>
      createLecture("v", "c", {
        title: "Lecture",
        mode: "OFFLINE",
        startTime: "2030-01-01T09:00:00Z",
        endTime: "2030-01-01T10:00:00Z",
      }),
  ],
  ["lecture cancel", () => cancelLecture("v", "l")],
  ["menu category create", () => createMenuCategory("v", { name: "Menu" })],
  ["menu category delete", () => deleteMenuCategory("m")],
  ["menu item create", () => createMenuItem("v", "m", item)],
  ["menu item update", () => updateMenuItem("v", "m", item)],
  ["menu item delete", () => deleteMenuItem("v", "m")],
];
describe("all service editors defer live mutations to review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.access.mockResolvedValue({ user: { id: "owner" } });
    m.queue.mockResolvedValue(true);
    m.find.mockResolvedValue({
      id: "row",
      vendorId: "v",
      trainer: { vendorId: "v" },
    });
    const model = {
      create: m.mutate,
      update: m.mutate,
      delete: m.mutate,
      deleteMany: m.mutate,
      createMany: m.mutate,
      findUniqueOrThrow: m.mutate,
      count: m.mutate,
    };
    m.transaction.mockImplementation(async (cb) =>
      cb({
        trainer: model,
        teacher: model,
        course: model,
        lecture: model,
        menuCategory: model,
        menuItem: model,
        trainerPricing: model,
        trainerAvailability: model,
        trainerSpecializationMap: model,
      }),
    );
  });
  it.each(cases)("%s writes only the proposed revision", async (_name, run) => {
    await run();
    expect(m.queue).toHaveBeenCalledOnce();
    expect(m.mutate).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it("does not queue another tenant’s mutation after authorization fails", async () => {
    m.access.mockRejectedValue(new Error("Tenant denied"));
    await expect(updateTrainer("t", person)).rejects.toThrow("Tenant denied");
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.queue).not.toHaveBeenCalled();
  });
});
