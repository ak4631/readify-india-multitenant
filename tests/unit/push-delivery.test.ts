import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  configured: true,
  jobs: [] as any[],
  notification: {} as any,
  tokenValid: true,
  bookingValid: true,
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase-admin", () => ({
  firebasePushMessaging: () => (mocks.configured ? { send: mocks.send } : null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join("");
      if (sql.includes("UPDATE admin.customer_push_deliveries"))
        return mocks.jobs;
      if (sql.includes("SELECT EXISTS")) return [{ valid: mocks.bookingValid }];
      return mocks.tokenValid ? [{ token: "token" }] : [];
    }),
    customerNotification: { findUnique: vi.fn(async () => mocks.notification) },
    customerPushDelivery: { updateMany: mocks.update },
    customerPushToken: { deleteMany: mocks.remove },
  },
}));
import { deliverCustomerPushes } from "@/lib/push-delivery";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured = true;
  mocks.tokenValid = true;
  mocks.bookingValid = true;
  mocks.jobs = [
    {
      id: "job",
      notification_id: "notice",
      token: "token",
      user_id: "customer",
      expires_at: new Date(Date.now() + 60000),
      attempts: 1,
    },
  ];
  mocks.notification = {
    id: "notice",
    userId: "customer",
    eventKey: "support:reply",
    readAt: null,
    title: "Update",
    body: "Body",
  };
  mocks.send.mockResolvedValue("message-id");
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.remove.mockResolvedValue({ count: 1 });
});
it("sends to the correct Android package and records success", async () => {
  expect(await deliverCustomerPushes()).toEqual({
    configured: true,
    sent: 1,
    failed: 0,
  });
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({
      token: "token",
      android: expect.objectContaining({
        restrictedPackageName: "com.zerotham",
        notification: expect.objectContaining({
          channelId: "zerotham_updates",
        }),
      }),
    }),
  );
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "job" },
      data: expect.objectContaining({ status: "SENT" }),
    }),
  );
});
it("removes tokens Firebase reports as no longer registered", async () => {
  mocks.send.mockRejectedValue({
    code: "messaging/registration-token-not-registered",
  });
  expect((await deliverCustomerPushes()).failed).toBe(1);
  expect(mocks.remove).toHaveBeenCalledWith({
    where: { token: "token", userId: "customer" },
  });
});
it("retries transient failures and stops after five attempts", async () => {
  mocks.send.mockRejectedValue({ code: "messaging/server-unavailable" });
  await deliverCustomerPushes();
  expect(mocks.update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        status: "PENDING",
        lastError: "messaging/server-unavailable",
      }),
    }),
  );
  mocks.jobs[0].attempts = 5;
  await deliverCustomerPushes();
  expect(mocks.update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED" }),
    }),
  );
});
it("does not deliver after account reassignment or suspension", async () => {
  mocks.tokenValid = false;
  await deliverCustomerPushes();
  expect(mocks.send).not.toHaveBeenCalled();
});
it("does not send a reminder for a cancelled booking", async () => {
  mocks.notification.eventKey = "booking-reminder:booking:123";
  mocks.bookingValid = false;
  await deliverCustomerPushes();
  expect(mocks.send).not.toHaveBeenCalled();
});
it("reports missing server credentials without consuming jobs", async () => {
  mocks.configured = false;
  expect(await deliverCustomerPushes()).toEqual({
    configured: false,
    sent: 0,
    failed: 0,
  });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it("includes promotional images and destination data in pushes", async () => {
  mocks.notification.imageUrl = "https://example.test/offer.png";
  mocks.notification.vendorId = "listing";
  await deliverCustomerPushes();
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({
      notification: expect.objectContaining({
        imageUrl: "https://example.test/offer.png",
      }),
      data: expect.objectContaining({
        notificationId: "notice",
        vendorId: "listing",
      }),
    }),
  );
});
