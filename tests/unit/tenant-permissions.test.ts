import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS, type PermissionKey } from "@/config/permissions";

function permissionsFor(role: string): PermissionKey[] {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions || permissions === "*") return [];
  return permissions;
}

describe("multi-tenant role boundaries", () => {
  it("lets partner admins manage their tenant without platform moderation powers", () => {
    const permissions = permissionsFor("PARTNER_ADMIN");

    expect(permissions).toContain("vendor.create");
    expect(permissions).toContain("vendor.read");
    expect(permissions).toContain("vendor.update");
    expect(permissions).toContain("verification.upload");
    expect(permissions).toContain("partnerUser.createEmployee");
    expect(permissions).not.toContain("vendor.approve");
    expect(permissions).not.toContain("vendor.publish");
    expect(permissions).not.toContain("verification.review");
  });

  it("keeps partner employees on limited listing permissions", () => {
    const permissions = permissionsFor("PARTNER_EMPLOYEE");
    expect(permissions).toContain("vendor.read");
    expect(permissions).toContain("vendor.update");
    expect(permissions).not.toContain("vendor.create");
    expect(permissions).not.toContain("partnerUser.createEmployee");
    expect(permissions).not.toContain("review.delete");
  });

  it("keeps legacy admins out of partner credential and approval powers", () => {
    const permissions = permissionsFor("ADMIN");

    expect(permissions).not.toContain("vendorAccount.create");
    expect(permissions).not.toContain("partner.create");
    expect(permissions).not.toContain("vendor.approve");
    expect(permissions).not.toContain("vendor.reject");
    expect(permissions).not.toContain("verification.review");
  });

  it("reserves every permission for the superadmin wildcard", () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toBe("*");
  });
});
