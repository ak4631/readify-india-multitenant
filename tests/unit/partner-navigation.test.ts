import { describe, expect, it } from "vitest";
import { visibleNavigation } from "@/config/nav";
import { ROLE_PERMISSIONS, type PermissionKey } from "@/config/permissions";
describe("Library workspace modules", () => {
  it("provides all 13 owner modules in roadmap order", () => {
    const items = visibleNavigation(
      ROLE_PERMISSIONS.PARTNER_ADMIN as PermissionKey[],
      ["PARTNER_ADMIN"],
    );
    expect(items.map((item) => item.href)).toEqual([
      "/dashboard",
      "/vendors",
      "/bookings",
      "/customers",
      "/plans",
      "/service-management",
      "/payments",
      "/reviews",
      "/team",
      "/notifications",
      "/control-panel",
      "/settings",
      "/support",
    ]);
  });
  it("keeps employee navigation out of the owner Control Panel", () => {
    const items = visibleNavigation(
      ROLE_PERMISSIONS.PARTNER_EMPLOYEE as PermissionKey[],
      ["PARTNER_EMPLOYEE"],
    );
    expect(items.some((item) => item.href === "/control-panel")).toBe(false);
    expect(items).toHaveLength(12);
  });
});
