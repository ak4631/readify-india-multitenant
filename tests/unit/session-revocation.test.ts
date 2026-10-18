import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), roles: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    userRole: { findMany: mocks.roles },
  },
}));
import { authOptions } from "@/lib/auth";
describe("live session revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("invalidates a just-issued employee token after deactivation", async () => {
    mocks.user.mockResolvedValue({ status: "SUSPENDED" });
    const token = await authOptions.callbacks!.jwt!({
      token: {
        id: "employee",
        iat: Math.floor(Date.now() / 1000),
        roles: ["PARTNER_EMPLOYEE"],
        permissions: ["vendor.update"],
      },
    } as never);
    expect(token.id).toBe("");
    expect(token.permissions).toEqual([]);
  });
  it("refreshes permissions on each request instead of relying on cookie age", async () => {
    mocks.user.mockResolvedValue({
      id: "employee",
      status: "ACTIVE",
      partnerId: "partner",
      partner: { status: "ACTIVE" },
    });
    mocks.roles.mockResolvedValue([]);
    const token = await authOptions.callbacks!.jwt!({
      token: {
        id: "employee",
        iat: Math.floor(Date.now() / 1000),
        roles: ["PARTNER_EMPLOYEE"],
        permissions: ["vendor.update"],
      },
    } as never);
    expect(token.roles).toEqual([]);
    expect(token.permissions).toEqual([]);
  });
});
