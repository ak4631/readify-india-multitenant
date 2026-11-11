import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  partner: vi.fn(),
  vendor: vi.fn(),
  vendors: vi.fn(),
  count: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user, count: mocks.count },
    partner: { findUnique: mocks.partner },
    vendor: {
      findUnique: mocks.vendor,
      findMany: mocks.vendors,
      count: mocks.count,
    },
  },
}));
import {
  resolveDataScope,
  getAccessibleVendorIds,
  requireVendorAccess,
  requireSuperAdminPermission,
} from "@/lib/rbac";
import { getDashboardMetrics } from "@/server/actions/dashboard.actions";

function session(roles = ["PARTNER_ADMIN"]): Session {
  return {
    expires: "2099-01-01",
    user: {
      id: "actor",
      name: "Actor",
      email: "actor@example.test",
      roles,
      permissions: ["dashboard.read", "vendor.update", "vendor.approve"],
    },
  };
}

describe("tenant and platform server boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue(session());
    mocks.user.mockResolvedValue({
      partnerId: "a",
      status: "ACTIVE",
      partner: { status: "ACTIVE", approvalStatus: "APPROVED" },
    });
    mocks.partner.mockResolvedValue({ id: "b" });
    mocks.vendor.mockResolvedValue({ partnerId: "a" });
    mocks.vendors.mockResolvedValue([]);
  });

  it("denies global dashboard data to partners even with dashboard.read", async () => {
    await expect(getDashboardMetrics()).rejects.toThrow("Platform staff");
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.vendors).not.toHaveBeenCalled();
  });

  it.each([
    "ADMIN",
    "SUPPORT",
    "VENDOR_MANAGER",
    "PARTNER_ADMIN",
    "PARTNER_EMPLOYEE",
  ])(
    "does not turn %s into an approver by granting a permission",
    async (role) => {
      mocks.session.mockResolvedValue(session([role]));
      await expect(
        requireSuperAdminPermission("vendor.approve"),
      ).rejects.toThrow();
    },
  );

  it("allows Super Admin with the requested permission", async () => {
    const actor = session(["SUPER_ADMIN"]);
    mocks.session.mockResolvedValue(actor);
    expect(await requireSuperAdminPermission("vendor.approve")).toEqual(actor);
  });

  it.each(["PARTNER_ADMIN", "PARTNER_EMPLOYEE", "USER"])(
    "rejects a mixed SUPER_ADMIN/%s account as platform authority",
    async (role) => {
      mocks.session.mockResolvedValue(session(["SUPER_ADMIN", role]));
      await expect(
        requireSuperAdminPermission("vendor.approve"),
      ).rejects.toThrow("Platform staff");
    },
  );

  it("still requires permission and authentication for Super Admin actions", async () => {
    const actor = session(["SUPER_ADMIN"]);
    actor.user.permissions = [];
    mocks.session.mockResolvedValue(actor);
    await expect(requireSuperAdminPermission("vendor.approve")).rejects.toThrow(
      "Missing permission",
    );
    mocks.session.mockResolvedValue(null);
    await expect(requireSuperAdminPermission("vendor.approve")).rejects.toThrow(
      "Not authenticated",
    );
  });

  it("derives tenant identity from the current database account", async () => {
    expect(await resolveDataScope(session())).toEqual({
      kind: "partner",
      partnerId: "a",
    });
    await expect(resolveDataScope(session(), "b")).rejects.toThrow(
      "access to this partner",
    );
  });

  it.each([
    null,
    { partnerId: null, status: "ACTIVE" },
    {
      partnerId: "a",
      status: "SUSPENDED",
      partner: { status: "ACTIVE", approvalStatus: "APPROVED" },
    },
    {
      partnerId: "a",
      status: "ACTIVE",
      partner: { status: "INACTIVE", approvalStatus: "APPROVED" },
    },
    {
      partnerId: "a",
      status: "ACTIVE",
      partner: { status: "ACTIVE", approvalStatus: "PENDING" },
    },
  ])(
    "denies detached, disabled and unapproved partner accounts: %j",
    async (account) => {
      mocks.user.mockResolvedValue(account);
      await expect(resolveDataScope(session())).rejects.toThrow(
        "Active partner access",
      );
      expect(mocks.vendors).not.toHaveBeenCalled();
    },
  );

  it("distinguishes an empty tenant from unrestricted platform scope", async () => {
    expect(await getAccessibleVendorIds(session())).toEqual([]);
    expect(mocks.vendors).toHaveBeenCalledWith({
      where: { partnerId: "a" },
      select: { id: true },
    });
    expect(await getAccessibleVendorIds(session(["SUPER_ADMIN"]))).toBeNull();
  });

  it("lets platform staff narrow to an existing partner, including inactive partners", async () => {
    expect(await resolveDataScope(session(["ADMIN"]), "b")).toEqual({
      kind: "partner",
      partnerId: "b",
    });
    mocks.partner.mockResolvedValue(null);
    await expect(
      resolveDataScope(session(["ADMIN"]), "missing"),
    ).rejects.toThrow("Partner not found");
    await expect(resolveDataScope(session(["ADMIN"]), "")).rejects.toThrow(
      "Invalid partner",
    );
  });

  it("checks the listing belongs to the current tenant", async () => {
    await expect(
      requireVendorAccess("listing-a", "vendor.update"),
    ).resolves.toBeTruthy();
    mocks.vendor.mockResolvedValue({ partnerId: "b" });
    await expect(
      requireVendorAccess("listing-b", "vendor.update"),
    ).rejects.toThrow("access to this listing");
    mocks.vendor.mockResolvedValue(null);
    await expect(
      requireVendorAccess("missing", "vendor.update"),
    ).rejects.toThrow("access to this listing");
  });
});
