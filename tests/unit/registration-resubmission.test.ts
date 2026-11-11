import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  find: vi.fn(),
  compare: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
  current: vi.fn(),
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async () => "hash"), compare: m.compare },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async () => [{ count: 1 }]),
    vendorCategory: {
      findUnique: vi.fn(async () => ({
        id: "category",
        name: "Library",
        status: "ACTIVE",
      })),
    },
    $transaction: async (cb: (tx: unknown) => unknown) =>
      cb({
        $queryRaw: vi.fn(),
        role: { findUniqueOrThrow: vi.fn(async () => ({ id: "role" })) },
        user: {
          findUnique: m.find,
          create: m.create,
          update: vi.fn(),
          findMany: vi.fn(async () => []),
        },
        partner: {
          findUniqueOrThrow: m.current,
          update: m.update,
          create: m.create,
        },
        auditLog: { create: m.audit },
        portalNotification: { createMany: m.notify },
      }),
  },
}));
import { POST } from "@/app/api/registration/route";
const payload = {
  name: "Owner",
  organization: "Organization",
  email: "owner@example.test",
  phone: "9999999999",
  password: "ValidPassword12",
  service: "library",
};
const request = () =>
  new Request("https://example.test/api/registration", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
  });
describe("rejected partner reapplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXTAUTH_SECRET", "test-only-secret");
    m.compare.mockResolvedValue(true);
    m.find.mockResolvedValue({
      id: "owner",
      status: "ACTIVE",
      partnerId: "org",
      passwordHash: "original-hash",
      partner: { approvalStatus: "REJECTED" },
      roles: [{ role: { name: "PARTNER_ADMIN" } }],
    });
    m.current.mockResolvedValue({
      id: "org",
      approvalStatus: "REJECTED",
      applicationVersion: 1,
      applicationReason: "Correct information",
    });
    m.update.mockResolvedValue({ id: "org", applicationVersion: 2 });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("requires existing credentials, preserves the account, increments version and retains decision history", async () => {
    expect((await POST(request())).status).toBe(201);
    expect(m.compare).toHaveBeenCalledWith(payload.password, "original-hash");
    expect(m.create).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvalStatus: "PENDING",
          status: "INACTIVE",
          applicationVersion: { increment: 1 },
        }),
      }),
    );
    expect(m.audit).toHaveBeenCalled();
  });
  it("does not reopen a rejected account with the wrong password", async () => {
    m.compare.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(409);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("does not overwrite an application another reviewer already decided or reopened", async () => {
    m.current.mockResolvedValue({
      id: "org",
      approvalStatus: "PENDING",
      applicationVersion: 2,
    });
    expect((await POST(request())).status).toBe(409);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("does not accept platform accounts as partner resubmissions", async () => {
    m.find.mockResolvedValue({
      status: "ACTIVE",
      partnerId: "org",
      partner: { approvalStatus: "REJECTED" },
      roles: [{ role: { name: "SUPER_ADMIN" } }],
    });
    expect((await POST(request())).status).toBe(409);
    expect(m.update).not.toHaveBeenCalled();
  });
});
