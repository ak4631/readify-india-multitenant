import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.user } },
}));
import { requireOwner } from "@/lib/owner-access";
describe("owner-only server boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({
      partnerId: "partner-a",
      status: "ACTIVE",
      partner: { status: "ACTIVE" },
    });
  });
  it("rejects employees before reading owner data", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "employee", roles: ["PARTNER_EMPLOYEE"] },
    });
    await expect(requireOwner()).rejects.toThrow("Owner access");
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("rejects mixed employee/owner roles and platform users", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "mixed", roles: ["PARTNER_ADMIN", "PARTNER_EMPLOYEE"] },
    });
    await expect(requireOwner()).rejects.toThrow("Owner access");
    mocks.session.mockResolvedValue({
      user: { id: "platform", roles: ["SUPER_ADMIN"] },
    });
    await expect(requireOwner()).rejects.toThrow("Owner access");
  });
  it("rejects a suspended owner even with an otherwise valid session", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "owner", roles: ["PARTNER_ADMIN"] },
    });
    mocks.user.mockResolvedValue({
      partnerId: "partner-a",
      status: "SUSPENDED",
      partner: { status: "ACTIVE" },
    });
    await expect(requireOwner()).rejects.toThrow("Active partner owner");
  });
  it("derives the partner from the database rather than a request parameter", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "owner", roles: ["PARTNER_ADMIN"] },
    });
    expect((await requireOwner()).partnerId).toBe("partner-a");
  });
});
