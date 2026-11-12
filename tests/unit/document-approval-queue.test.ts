import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  scope: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
}));
vi.mock("@/lib/rbac", () => ({
  requirePermission: mocks.access,
  getSessionPartnerId: mocks.scope,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { vendorVerification: { findMany: mocks.find, count: mocks.count } },
}));
import { listApprovalQueue } from "@/server/actions/approval-queue.actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ user: { id: "user" } });
  mocks.find.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});
it.each([null, "partner"])(
  "includes pending private documents from published listings while retaining scope %s",
  async (partnerId) => {
    mocks.scope.mockResolvedValue(partnerId);
    await listApprovalQueue({ kind: "documents" });
    const where = mocks.find.mock.calls[0][0].where;
    expect(where.status).toBe("PENDING");
    expect(where.vendor.status.in).toContain("PUBLISHED");
    expect(where.vendor.status.in).toContain("UNDER_REVIEW");
    if (partnerId) expect(where.vendor.partnerId).toBe(partnerId);
    else expect(where.vendor).not.toHaveProperty("partnerId");
    expect(mocks.count).toHaveBeenCalledWith({ where });
  },
);
