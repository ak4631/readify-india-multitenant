import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/lib/rbac", () => ({ requireSuperAdmin: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    promotionalBanner: { findUnique: mocks.find, update: mocks.update },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/imagekit", () => ({
  uploadVendorPhoto: mocks.upload,
  deleteVendorPhoto: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  savePromotionalBanner,
  deactivatePromotionalBanner,
} from "@/server/actions/promotions.actions";
beforeEach(() => {
  vi.clearAllMocks();
});
it("requires Super Admin access before reading banner data or uploading", async () => {
  mocks.auth.mockRejectedValue(new Error("Super admin access required"));
  await expect(savePromotionalBanner(new FormData())).rejects.toThrow(
    /Super admin/,
  );
  await expect(deactivatePromotionalBanner("id")).rejects.toThrow(
    /Super admin/,
  );
  expect(mocks.find).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("rejects invalid destinations and schedules before creating a banner", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "staff" } });
  const form = new FormData();
  Object.entries({
    title: "Offer",
    destinationUrl: "javascript:alert(1)",
    vendorId: "",
    targetCity: "",
    targetArea: "",
    latitude: "",
    longitude: "",
    radiusKm: "",
    startsAt: "2030-01-02",
    endsAt: "2030-01-01",
    sortOrder: "0",
  }).forEach(([key, value]) => form.set(key, value));
  await expect(savePromotionalBanner(form)).rejects.toThrow(
    /HTTPS|after start/,
  );
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
