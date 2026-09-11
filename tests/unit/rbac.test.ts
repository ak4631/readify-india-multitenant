import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/rbac";
import type { Session } from "next-auth";

function sessionWith(permissions: Session["user"]["permissions"]): Session {
  return {
    expires: new Date(Date.now() + 3600_000).toISOString(),
    user: {
      id: "user_1",
      name: "Test User",
      email: "test@example.com",
      roles: ["ADMIN"],
      permissions,
    },
  };
}

describe("hasPermission", () => {
  it("returns false for a null session", () => {
    expect(hasPermission(null, "vendor.read")).toBe(false);
  });

  it("returns false when the permission is not in the list", () => {
    expect(hasPermission(sessionWith(["user.read"]), "vendor.approve")).toBe(false);
  });

  it("returns true when the permission is present", () => {
    expect(hasPermission(sessionWith(["vendor.read", "vendor.approve"]), "vendor.approve")).toBe(
      true,
    );
  });

  it("returns false for an empty permission list", () => {
    expect(hasPermission(sessionWith([]), "dashboard.read")).toBe(false);
  });
});
