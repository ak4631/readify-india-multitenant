import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: { user: { id: "actor" } },
  tx: {
    $queryRaw: vi.fn(),
    user: { findUniqueOrThrow: vi.fn(), count: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/rbac", () => ({
  requireSuperAdmin: vi.fn(async () => mocks.session),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(async (fn) => fn(mocks.tx)) },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { suspendUser } from "@/server/actions/users.actions";
describe("global user suspension boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.user.findUniqueOrThrow.mockResolvedValue({
      id: "owner",
      partnerId: "org",
      status: "ACTIVE",
      roles: [{ role: { name: "PARTNER_ADMIN" } }],
    });
    mocks.tx.user.count.mockResolvedValue(0);
    mocks.tx.user.update.mockResolvedValue({ status: "SUSPENDED" });
  });
  it("prevents self suspension", async () => {
    await expect(suspendUser({ userId: "actor" })).rejects.toThrow(
      "own account",
    );
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });
  it("prevents suspending the last active partner owner through the global screen", async () => {
    await expect(suspendUser({ userId: "owner" })).rejects.toThrow(
      "last partner owner",
    );
    expect(mocks.tx.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });
  it("allows suspension when another active owner remains", async () => {
    mocks.tx.user.count.mockResolvedValue(1);
    await suspendUser({ userId: "owner" });
    expect(mocks.tx.user.update).toHaveBeenCalledOnce();
  });
  it("protects Super Admin accounts", async () => {
    mocks.tx.user.findUniqueOrThrow.mockResolvedValue({
      roles: [{ role: { name: "SUPER_ADMIN" } }],
    });
    await expect(suspendUser({ userId: "admin" })).rejects.toThrow(
      "Super Admin",
    );
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });
});
