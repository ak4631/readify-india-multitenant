import { beforeEach, expect, it, vi } from "vitest";
import { visibleNavigation } from "@/config/nav";
import {
  PERMISSIONS,
  type PermissionKey,
  ROLE_PERMISSIONS,
} from "@/config/permissions";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  upload: vi.fn(),
  category: vi.fn(),
}));
vi.mock("@/lib/rbac", () => ({ requireSuperAdmin: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    vendorCategory: { findFirst: mocks.category },
  },
}));
vi.mock("@/lib/imagekit", () => ({
  uploadVendorPhoto: mocks.upload,
  deleteVendorPhoto: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  createMarketingCampaign,
  cancelMarketingCampaign,
} from "@/server/actions/marketing.actions";
beforeEach(() => vi.clearAllMocks());
it("hides Marketing from Admin and partner roles, shows it for Super Admin", () => {
  for (const role of ["ADMIN", "PARTNER_ADMIN", "PARTNER_EMPLOYEE"] as const)
    expect(
      visibleNavigation(ROLE_PERMISSIONS[role] as PermissionKey[], [role]).some(
        (i) => i.href === "/marketing",
      ),
    ).toBe(false);
  expect(
    visibleNavigation(
      PERMISSIONS.map((p) => p.key),
      ["SUPER_ADMIN"],
    ).some((i) => i.href === "/marketing"),
  ).toBe(true);
});
it("authorizes both mutations before database access or upload", async () => {
  mocks.auth.mockRejectedValue(new Error("Super admin access required"));
  await expect(createMarketingCampaign(new FormData())).rejects.toThrow(
    /Super admin/,
  );
  await expect(cancelMarketingCampaign("campaign")).rejects.toThrow(
    /Super admin/,
  );
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
});
function form() {
  const f = new FormData();
  Object.entries({
    title: "An offer",
    body: "Save on your next visit",
    vendorId: "",
    serviceCategory: "",
    destinationUrl: "https://example.test/offer",
    targetCity: "",
    targetArea: "",
    targetService: "",
    mode: "now",
  }).forEach(([k, v]) => f.set(k, v));
  return f;
}
it("rejects unsafe links, contradictory destinations, area without city and past schedules", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "staff" } });
  for (const fields of [
    { destinationUrl: "javascript:alert(1)" },
    { serviceCategory: "library" },
    { targetArea: "Downtown" },
    { mode: "schedule", scheduledAt: "2020-01-01T00:00:00Z" },
  ]) {
    const f = form();
    Object.entries(fields).forEach(([k, v]) => f.set(k, v));
    await expect(createMarketingCampaign(f)).rejects.toThrow();
  }
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
});
