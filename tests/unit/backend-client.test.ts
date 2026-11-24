import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  revalidate: vi.fn(),
  database: vi.fn(),
  permission: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "session=staff" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/prisma", () => ({
  prisma: { vendor: { count: mocks.database } },
}));
vi.mock("@/lib/rbac", () => ({ requirePlatformPermission: mocks.permission }));
import { callBackend } from "@/lib/backend-client";
import { getDashboardMetrics } from "@/server/actions/dashboard.actions";
import { verifyBackendSignature } from "@/lib/backend-signature";

describe("frontend backend connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("BACKEND_URL", "http://localhost:4000");
    vi.stubEnv("BACKEND_SHARED_SECRET", "x".repeat(32));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("forwards the existing action without querying the frontend database", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({
        success: true,
        value: ["object", [["totalVendors", ["value", 42]]]],
        invalidations: [],
      }),
    );
    expect(await getDashboardMetrics()).toEqual({ totalVendors: 42 });
    expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.permission).not.toHaveBeenCalled();
    const [url, request] = mocks.fetch.mock.calls[0];
    expect(url.toString()).toBe("http://localhost:4000/api/internal/dispatch");
    expect(JSON.parse(request.body).operation).toBe(
      "dashboard.actions.getDashboardMetrics",
    );
    expect(
      verifyBackendSignature(
        "x".repeat(32),
        request.headers["x-backend-time"],
        "session=staff",
        request.body,
        request.headers["x-backend-signature"],
      ),
    ).toBe(true);
    expect(request.cache).toBe("no-store");
  });
  it("restores dates and applies backend cache invalidations on the frontend", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({
        success: true,
        value: ["date", "2026-11-24T00:00:00.000Z"],
        invalidations: [["/vendors/one", null]],
      }),
    );
    expect(await callBackend("test", [])).toEqual(
      new Date("2026-11-24T00:00:00.000Z"),
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/vendors/one", undefined);
  });
  it("returns deliberate business failures without exposing backend error bodies", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({
        success: false,
        message: "Missing permission: vendor.read",
      }),
    );
    await expect(callBackend("test", [])).rejects.toThrow(
      "Missing permission: vendor.read",
    );
    mocks.fetch.mockResolvedValue(
      new Response("private database information", { status: 503 }),
    );
    await expect(callBackend("test", [])).rejects.toThrow(
      "Backend request failed (503)",
    );
  });
});
