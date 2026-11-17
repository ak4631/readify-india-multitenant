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
  create: vi.fn(),
  query: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/push-delivery", () => ({ deliverCustomerPushes: mocks.push }));
vi.mock("@/lib/rbac", () => ({ requireSuperAdmin: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    $queryRaw: mocks.query,
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
  previewMarketingAudience,
} from "@/server/actions/marketing.actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ id: "new-campaign" });
  mocks.query.mockResolvedValue([{ count: 8, recipients: 8, pushUsers: 2 }]);
  mocks.push.mockResolvedValue({ configured: true, sent: 2, failed: 0 });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      marketingCampaign: { create: mocks.create },
      $queryRaw: mocks.query,
    }),
  );
});
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
  await expect(previewMarketingAudience(new FormData())).rejects.toThrow(
    /Super admin/,
  );
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
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

it("sends to all active users immediately without a listing or any destination", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "staff" } });
  const f = form();
  f.delete("vendorId");
  f.delete("serviceCategory");
  f.delete("destinationUrl");
  const result = await createMarketingCampaign(f);
  expect(result).toEqual({
    id: "new-campaign",
    status: "QUEUED",
    recipientCount: 8,
    pushStatus: "attempted",
  });
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        vendorId: null,
        serviceCategory: null,
        destinationUrl: null,
        targetCity: null,
        targetService: null,
      }),
    }),
  );
  expect(mocks.query).toHaveBeenCalledWith(expect.anything(), "new-campaign");
  expect(mocks.push).toHaveBeenCalledWith("new-campaign");
});
it("schedules future notifications without queuing or sending them now", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "staff" } });
  const f = form();
  f.set("mode", "schedule");
  f.set("scheduledAt", "2099-01-01T00:00:00Z");
  f.set("destinationUrl", "");
  expect((await createMarketingCampaign(f)).status).toBe("SCHEDULED");
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});
it("reports zero matching users rather than leaving a misleading scheduled send-now record", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "staff" } });
  mocks.query.mockResolvedValue([{ count: 0 }]);
  await expect(createMarketingCampaign(form())).rejects.toThrow(
    /No active users match/,
  );
  expect(mocks.push).not.toHaveBeenCalled();
});
it("preserves a committed one-time inbox notification if push delivery fails", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "staff" } });
  mocks.push.mockRejectedValue(new Error("Provider unavailable"));
  const result = await createMarketingCampaign(form());
  expect(result.status).toBe("QUEUED");
  expect(result.pushStatus).toBe("pending");
  expect(result.recipientCount).toBe(8);
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
it("previews active-user and push-enabled counts separately", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "staff" } });
  expect(await previewMarketingAudience(new FormData())).toEqual({
    count: 8,
    recipients: 8,
    pushUsers: 2,
  });
});
